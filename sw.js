
const CHUNK_SIZE = 1024 * 1024 * 2;


class Reader {
    constructor() {
        
    }

    /**
     * Derive key and decode metadata
     * @param {string} filename 
     * @param {string} password 
     */
    async open(filename, password) {
        this.filename = filename;

        this.salt = await this.readRaw(0, 16);
        this.nonce = new Uint8Array(12).fill(0);

        this.key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", hash: "SHA-512", salt: this.salt, iterations: 210000 },
            await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]),
            { name: "AES-GCM", length: 128 },
            false,
            ["decrypt"]
        );

        const metadataLengthBuffer = await this.decrypt(await this.readRaw(16, 16 + 2 + 16), 0);
        const metadataLength = metadataLengthBuffer[0] + (metadataLengthBuffer[1] << 8);
        
        const metadataBuffer = await this.decrypt(await this.readRaw(16 + 2 + 16, 16 + 2 + 16 + metadataLength + 16), 1);
        const metadata = JSON.parse(new TextDecoder().decode(metadataBuffer));

        if (typeof metadata["length"] !== "number" || typeof metadata["original_filename"] !== "string" || typeof metadata["mimetype"] !== "string" || !(/^[a-z]+\/[a-z\-\+]+$/.test(metadata["mimetype"]))) {
            throw new Error("invalid metadata");
        }

        this.length = metadata["length"];
        this.original_filename = metadata["original_filename"];
        this.mimetype = metadata["mimetype"];

        this.chunkStartOffset = 16 + 2 + 16 + metadataLength + 16; // salt + metadata length + metadata
        this.encryptedFilesize = this.chunkStartOffset + this.length + Math.ceil(this.length / CHUNK_SIZE) * 16;
        this.totalChunks = Math.ceil(this.length / CHUNK_SIZE);

        console.log("open", this.filename, this.length, this.original_filename, this.mimetype);
    }

    /**
     * Get plaintext chunk by index
     * @param {number} chunkIndex starts from 0
     * @returns {Promise<Uint8Array>}
     */
    async readChunk(chunkIndex) {
        const offset = this.chunkStartOffset + chunkIndex * (CHUNK_SIZE + 16);
        const encryptedChunk = await this.readRaw(offset, Math.min(offset + CHUNK_SIZE + 16, this.encryptedFilesize));
        return await this.decrypt(encryptedChunk, chunkIndex + 2);
    }

    /**
     * Read unencrypted data
     * @param {number} start 
     * @param {number} end
     * @returns {Promise<Uint8Array>}
     */
    async readRaw(start, end) {
        if (!this.filename) {
            throw new Error("filename not set");
        }

        const resp = await fetch("/readpart.php?filename=" + this.filename + "&start=" + start + "&end=" + end);
        if (resp.status != 200) {
            throw new Error("bad status code: " + resp.status);
        }

        return await resp.bytes();
    }

    /**
     * Decrypt chunk
     * @param {Uint8Array} data data to decrypt
     * @param {number} nonce
     * @returns {Promise<Uint8Array>}
     */
    async decrypt(data, nonce) {

        if (!this.key || !this.nonce) {
            throw new Error("writer not initialized");
        }

        const nonceBuffer = new Uint8Array(12).fill(0);
        nonceBuffer[11] = nonce & 0xff;
        nonceBuffer[10] = (nonce >> 8) & 0xff;
        nonceBuffer[9] = (nonce >> 16) & 0xff;
        nonceBuffer[8] = (nonce >> 24) & 0xff;

        const decrypted =  await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonceBuffer, additionalData: new TextEncoder().encode("unsatisfiedlink"), tagLength: 128},
            this.key,
            data
        );
        return new Uint8Array(decrypted);
    }
}

/**
 * Parse Range header
 * @param {Request} request 
 * @param {number} length plaintext length
 * @returns {{start: number, end: number} | null} {start, end} inclusive
 */
function parseRange(request, length) {
    if (!request.headers.has("Range")) {
        return null;
    }

    const range = request.headers.get("Range");
    const m = range.match(/^bytes=(\d+)-(\d+)?$/);
    if (!m) {
        return null;
    }

    const start = parseInt(m[1], 10);
    let end = length - 1;
    if (m[2]) end = parseInt(m[2], 10);

    if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
        return null;
    }

    return {
        start: start,
        end: end
    };
}

/**
 * Handle request to /sw/...
 * @param {Request} request 
 */
async function handleRequest(request) {
    const url = new URL(request.url);

    const filename = url.pathname.substring(4);
    const password = url.hash.substring(1);

    if (!filename || !password) {
        return new Response("Bad request", { status: 400 });
    }

    const r = new Reader();
    await r.open(filename, password);

    const range = parseRange(request, r.length);

    // HEAD request

    if (request.method === "HEAD") {
        if (range) {
            return new Response(null, {
                status: 206,
                headers: {
                    "Content-Length": range.end - range.start + 1,
                    "Content-Type": r.mimetype,
                    "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(r.original_filename),
                    "Content-Range": "bytes " + range.start + "-" + range.end + "/" + r.length,
                }
            });
        } else {
            return new Response(null, {
                status: 200,
                headers: {
                    "Content-Length": r.length,
                    "Content-Type": r.mimetype,
                    "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(r.original_filename),
                    "Accept-Ranges": "bytes"
                }
            });
        }
    }

    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    // GET request

    if (!range) {
        // read all

        let chunk = 0;

        return new Response(new ReadableStream({
            async pull(controller) {

                try  {
                    const data = await r.readChunk(chunk);
                    controller.enqueue(data);
                    chunk++;
                    if (chunk >= r.totalChunks) {
                        controller.close();
                    }
                } catch (e) {
                    console.error(e);
                    controller.error(e);
                }

            }
        }), {
            status: 200,
            headers: {
                "Content-Length": r.length,
                "Content-Type": r.mimetype,
                // "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(r.original_filename),
                "Accept-Ranges": "bytes"
            }
        });

    } else {

        // read range

        let start = range.start;
        let end = range.end + 1; // exclusize

        console.log("range request", start, end, r.length);

        if (end > r.length || end <= start || start < 0 || start < 0 || start >= r.length) {
            return new Response("Range Not Satisfiable", { status: 416 });
        }

        let chunk = 0;

        return new Response(new ReadableStream({
            async pull(controller) {

                try  {

                    while (true) {
                        const chunkStart = chunk * CHUNK_SIZE;
                        const chunkEnd = Math.min((chunk + 1) * CHUNK_SIZE - 1, r.length - 1);

                        if (end < chunkStart || chunkEnd < start) {
                            chunk++;
                            if (chunk > r.totalChunks) {
                                break;
                            }
                            continue;
                        }

                        break;
                    }

                    const chunkStart = chunk * CHUNK_SIZE;
                    const chunkEnd = Math.min((chunk + 1) * CHUNK_SIZE - 1, r.length - 1);

                    if (chunk >= r.totalChunks) {
                        controller.close();
                        return;
                    }

                    const overlapStart = Math.max(chunkStart, start);
                    const overlapEnd = Math.min(chunkEnd, end);

                    const data = await r.readChunk(chunk);

                    controller.enqueue(data.slice(overlapStart - chunkStart, overlapEnd - chunkStart));

                } catch (e) {
                    console.error(e);
                    // controller.error(e);
                }

            }
        }), {
            status: 206,
            headers: {
                "Content-Length": (end - start),
                "Content-Type": r.mimetype,
                // "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(r.original_filename),
                "Accept-Ranges": "bytes",
                "Content-Range": "bytes " + start + "-" + (end - 1) + "/" + r.length,
            }
        });
    }

}


self.addEventListener("install", e => {
    console.log("sw installed");
    self.skipWaiting();
})

self.addEventListener("activate", (event) => {
    console.log("sw activated");
    event.waitUntil(clients.claim());
});

self.addEventListener("fetch", e => {

    const url = new URL(e.request.url);

    if (!url.pathname.startsWith("/sw/") || url.host !== self.location.host) {
        return;
    }

    console.log("fetch", url.toString(), self.location.host);

    e.respondWith(new Promise((resolve) => {
        handleRequest(e.request).then(resolve).catch(err => {
            console.error(err);
            resolve(new Response("<span style='font-family: system-ui;'>Internal error: Could not decrypt file (service worker)</span>", { status: 500, headers: { "Content-Type": "text/html" } }));
        });
    }));

});