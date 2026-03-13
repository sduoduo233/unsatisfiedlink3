
self.importScripts("reader.js");

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

        return new Response(new ReadableStream({
            async pull(controller) {

                try  {

                    let startChunkIdx = Math.floor(start / CHUNK_SIZE);
                    let endChunkIdx = Math.floor(end / CHUNK_SIZE);

                    for (let chunk = startChunkIdx; chunk <= endChunkIdx; chunk++) {
                        const data = await r.readChunk(chunk);
                        const chunkStart = chunk * CHUNK_SIZE;
                        const chunkEnd = chunkStart + CHUNK_SIZE;

                        const sliceStart = Math.max(start, chunkStart) - chunkStart;
                        const sliceEnd = Math.min(end, chunkEnd) - chunkStart;

                        controller.enqueue(data.slice(sliceStart, sliceEnd));
                    }

                } catch (e) {
                    console.error(e);
                    controller.error(e);
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