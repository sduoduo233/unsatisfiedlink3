
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
        const metadataPlaintext = new TextDecoder().decode(metadataBuffer);
        const metadata = JSON.parse(metadataPlaintext);

        if (typeof metadata["length"] !== "number" || typeof metadata["original_filename"] !== "string" || typeof metadata["mimetype"] !== "string" || !(/^[a-z]+\/[a-z\-\+]+$/.test(metadata["mimetype"]))) {
            console.error("invalid metadata", metadataPlaintext);
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