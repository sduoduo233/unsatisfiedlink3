

const CHUNK_SIZE = 1024 * 1024 * 2;

class Writer {

    constructor () {
        this.buffer = new Uint8Array(CHUNK_SIZE);
        this.buffer.fill(0);
        this.bufferFilled = 0;
        this.bytesWritten = 0;
    }

    /**
     * Generate password, create file and write metadata.
     */
    async start(length, original_filename, mimetype) {
        // Create new file

        const resp = await fetch("/startupload.php", {
            method: "POST",
        });

        if (resp.status !== 200) {
            throw new Error("startupload.php error");
        }

        const data = await resp.json();
        this.filename = data["filename"];
        this.admin_password = data["admin_password"];
        this.length = length;
        
        // Generate password & salt

        this.nonce = new Uint8Array(12).fill(0);
        this.salt = crypto.getRandomValues(new Uint8Array(16));
        this.password = this.randomString(14); // ascii password

        // Write salt
        await this.uploadPart(this.salt);

        // Derive Key
        this.key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", hash: "SHA-512", salt: this.salt, iterations: 210000 },
            await crypto.subtle.importKey("raw", new TextEncoder().encode(this.password), "PBKDF2", false, ["deriveKey"]),
            { name: "AES-GCM", length: 128 },
            false,
            ["encrypt"]
        );

        // Write metadata
        const metadata = new TextEncoder().encode(JSON.stringify({
            "length": length,
            "original_filename": original_filename,
            "mimetype": mimetype
        }));

        if (metadata.length > 0xffff) {
            throw new Error("metadata too long");
        }

        const metadataLength = new Uint8Array(2);
        metadataLength[0] = metadata.length & 0xff;
        metadataLength[1] = (metadata.length >> 8) & 0xff;

        await this.uploadPart(await this.encrypt(metadataLength));
        await this.uploadPart(await this.encrypt(metadata));
    }

    /**
     * Encrypt and upload
     * @param {Uint8Array} data plaintext data
     */
    async write(data) {
        this.bytesWritten += data.length;
        while (data.length > 0) {
            // Copy as much data as possible to buffer
            const space_left = CHUNK_SIZE - this.bufferFilled;
            const slice = data.slice(0, Math.min(data.length, space_left));
            this.buffer.set(slice, this.bufferFilled);
            data = data.slice(Math.min(data.length, space_left));
            this.bufferFilled += slice.length;

            // Encrypt and upload if buffer is full
            if (this.bufferFilled === CHUNK_SIZE) {
                await this.uploadPart(await this.encrypt(this.buffer));
                this.bufferFilled = 0;
                this.buffer.fill(0);
            }
        }
    }

    /**
     * Close file
     */
    async close() {
        if (!this.filename) {
            throw new Error("writer not initialized");
        }

        // Flush buffer
        if (this.bufferFilled > 0) await this.uploadPart(await this.encrypt(this.buffer.slice(0, this.bufferFilled)));

        if (this.bytesWritten !== this.length) {
            throw new Error("written bytes do not match expected length");
        }

        // Call endupload.php
        const form = new FormData();
        form.set("filename", this.filename);
        form.set("admin_password", this.admin_password);

        const resp = await fetch("/endupload.php", {
            method: "POST",
            body: form
        });

        if (resp.status !== 200) {
            throw new Error("end upload failed");
        }
    }

    /**
     * Encrypt and increment nounce
     * @param {Uint8Array} data data to encrypt
     */
    async encrypt(data) {

        if (!this.key || !this.nonce) {
            throw new Error("writer not initialized");
        }

        const encrypted =  await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: this.nonce, additionalData: new TextEncoder().encode("unsatisfiedlink"), tagLength: 128},
            this.key,
            data
        );

        for (let i = this.nonce.length - 1; i >= 0; i-- ) {
            if (this.nonce[i] === 255){
                this.nonce[i] = 0;
            } else {
                this.nonce[i]++;
                break;
            }
        }

        

        return encrypted;
    }

    /**
     * Call uploadpart.php with part
     * @param {Uint8Array} part data to upload
     */
    async uploadPart(part) {

        if (!this.filename) {
            throw new Error("writer not initialized");
        }

        const form = new FormData();
        form.set("filename", this.filename);
        form.set("admin_password", this.admin_password);
        form.set("file", new Blob([part]));

        const resp = await fetch("/uploadpart.php", {
            method: "POST",
            body: form
        })

        if (resp.status !== 200) {
            throw new Error("upload part failed");
        }
    }

    randomString(length) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        let s = "";
        const array = new Uint32Array(length);
        crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            s += chars[array[i] % chars.length];
        }
        return s;
    }
}