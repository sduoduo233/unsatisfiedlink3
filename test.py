"""Playwright test for chunked upload/download integrity.

This script uploads randomly generated files of multiple sizes, and verifies:
- full-file downloads
- HTTP Range partial downloads
"""

from playwright.sync_api import sync_playwright
import secrets
import hashlib
from urllib.parse import urljoin

CHUNK_SIZE = 1024 * 1024 * 2

URL = "http://localhost:9008/"

tmp_path = "/tmp/" + secrets.token_hex(16) + ".bin"
download_path = "/tmp/" + secrets.token_hex(16) + ".bin"


def build_range_cases(size_bytes: int) -> list[tuple[int, int]]:
    if size_bytes <= 0:
        return []

    candidates = [
        (0, 4095),
        (CHUNK_SIZE - 16, CHUNK_SIZE + 16),
        (CHUNK_SIZE - 1, CHUNK_SIZE),
        (CHUNK_SIZE, CHUNK_SIZE + 1),
        (CHUNK_SIZE * 2 - 1, CHUNK_SIZE * 2 + 1),
        (size_bytes - 16, size_bytes - 1),
        (10, CHUNK_SIZE * 2 + 1),
        (CHUNK_SIZE + 1, CHUNK_SIZE * 2 + 1),
        (CHUNK_SIZE, CHUNK_SIZE * 2),
    ]

    ranges: list[tuple[int, int]] = []
    for start, end in candidates:
        start = max(0, start)
        end = min(size_bytes - 1, end)
        if start <= end and start < size_bytes:
            ranges.append((start, end))

    # Deduplicate while preserving order.
    deduped: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for item in ranges:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped

def create_tmp_file(size_bytes: int) -> str:
    h = hashlib.sha256()
    with open(tmp_path, "wb") as f:
        for _ in range(size_bytes // 4096):
            r = secrets.token_bytes(4096)
            h.update(r)
            f.write(r)
        if size_bytes % 4096 != 0:
            r = secrets.token_bytes(size_bytes % 4096)
            h.update(r)
            f.write(r)
    return h.hexdigest()


def sw_fetch_range(page, url: str, start: int, end: int) -> tuple[int, str, str, int]:
    # page.pause(); 
    result = page.evaluate(
        """async ({ url, start, end }) => {
            console.log("sw_fetch_range", "start", start, "end", end, "url", url);
            const resp = await fetch(url, {
                headers: { Range: `bytes=${start}-${end}` }
            });
            const body = new Uint8Array(await resp.arrayBuffer());
            console.log("sw_fetch_range", body.length, "bytes");

            const digest = await crypto.subtle.digest("SHA-256", body);
            const bodySha256 = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

            return {
                status: resp.status,
                contentRange: resp.headers.get("content-range") || "",
                bodySha256,
                bodyLength: body.length
            };
        }""",
        {
            "url": url,
            "start": start,
            "end": end,
        },
    )
    return result["status"], result["contentRange"], result["bodySha256"], result["bodyLength"]

with sync_playwright() as playwright:
    chrome = playwright.chromium.launch(headless=False)

    for size_bytes in [
        1, 10, 100,
        CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1,
        CHUNK_SIZE * 2 - 1, CHUNK_SIZE * 2, CHUNK_SIZE * 2 + 1,
        CHUNK_SIZE * 3 - 1, CHUNK_SIZE * 3, CHUNK_SIZE * 3 + 1,
        CHUNK_SIZE * 10
    ]:

        page = chrome.new_page()

        # create file

        hash = create_tmp_file(size_bytes)

        # upload file

        page.goto(URL)


        with page.expect_file_chooser() as fc_info:
            page.locator(".card").click()

        file_chooser = fc_info.value
        file_chooser.set_files(tmp_path)

        page.locator("#btn").click()
        
        page.wait_for_url("**/d?**")
        page.wait_for_function(
            """() => {
                const btn = document.querySelector('#btn');
                return !!(
                    btn &&
                    btn.getAttribute('href') &&
                    !btn.classList.contains('disabled') &&
                    btn.getAttribute('aria-disabled') === 'false'
                );
            }"""
        )

        # test partial download around chunk boundaries
        with open(tmp_path, "rb") as source:
            download_href = page.locator("#btn").get_attribute("href")
            assert download_href is not None
            download_url = urljoin(page.url, download_href)


            for start, end in build_range_cases(size_bytes):

                print(f"Testing range bytes={start}-{end} {download_url}")

                status, content_range, body_sha256, body_length = sw_fetch_range(page, download_url, start, end)

                if status != 206:
                    print(f"status={status}, bodyLength={body_length}, bodySha256={body_sha256}")
                    assert status == 206

                assert content_range.startswith(f"bytes {start}-{end}/"), (
                    f"Unexpected Content-Range for bytes={start}-{end}: {content_range}"
                )

                source.seek(start)
                expected = source.read(end - start + 1)
                expected_sha256 = hashlib.sha256(expected).hexdigest()

                assert body_length == len(expected), (
                    f"Partial download length mismatch for bytes={start}-{end} "
                    f"(got {body_length} bytes, expected {len(expected)} bytes)"
                )

                assert body_sha256 == expected_sha256, (
                    f"Partial download SHA-256 mismatch for bytes={start}-{end} "
                    f"(got {body_sha256}, expected {expected_sha256})"
                )

        # download file
        with page.expect_download() as download_info:
            page.locator("#btn").click()

        download_info.value.save_as(download_path)

        # verify file
        with open(download_path, "rb") as f:
            h = hashlib.sha256()
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                h.update(chunk)

        print(f"size: {size_bytes}, hash: {h.hexdigest()}, expected: {hash}")
        assert h.hexdigest() == hash


        page.close()