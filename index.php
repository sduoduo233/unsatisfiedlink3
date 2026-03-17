<?php

$nonce = bin2hex(random_bytes(16));

header("Content-Security-Policy: script-src 'nonce-{$nonce}'; img-src 'self'; font-src https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/; frame-ancestors 'none'");

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unsatisfiedlink.com - End-to-end encrypted file transfer</title>

    <script nonce="<?php echo $nonce ?>" src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.8/js/bootstrap.bundle.min.js" integrity="sha512-HvOjJrdwNpDbkGJIG2ZNqDlVqMo77qbs4Me4cah0HoDrfhrbA+8SBlZn1KrvAQw7cILLPFJvdwIgphzQmMm+Pw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <link nonce="<?php echo $nonce ?>" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.8/css/bootstrap.min.css" integrity="sha512-2bBQCjcnw658Lho4nlXJcc6WkV/UxpE/sAokbXPxQNGqmNdQrWqtw26Ns9kFF/yG792pKR1Sx8/Y1Lf1XN4GKA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script nonce="<?php echo $nonce ?>" src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js" integrity="sha512-v2CJ7UaYy4JwqLDIrZUI/4hqeoQieOmAZNXBeQyjo21dadnwR+8ZaIJVT8EE2iyI61OV8e6M8PP2/4hpQINQ/g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <link nonce="<?php echo $nonce ?>" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.13.1/font/bootstrap-icons.min.css" integrity="sha512-t7Few9xlddEmgd3oKZQahkNI4dS6l80+eGEzFQiqtyVYdvcSG2D3Iub77R20BdotfRPA9caaRkg1tyaJiPmO0g==" crossorigin="anonymous" referrerpolicy="no-referrer" />

    <script nonce="<?php echo $nonce ?>" src="/writer.js"></script>
</head>
<body data-bs-theme="dark">

<div class="d-flex align-items-center justify-content-center vh-100">
    <div class="d-flex flex-column align-items-start">
        <h1 class="">Unsatisfiedlink.com</h1>
        <p class="lead">End-to-end encrypted file transfer</p>


        <ul class="nav nav-tabs mb-3 w-100">
            <li class="nav-item">
                <a class="nav-link active" id="nav-file">File</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" id="nav-text">Text</a>
            </li>
        </ul>

        <label id="file-area">
            <div class="card" id="file-card">
                <div class="card-body d-flex flex-column align-items-center justify-content-center" style="width: 800px; height: 400px; max-width: 90vw; max-height: 40vh;">
                    <span class="fs-1 text-muted" style="display: none;" id="file-icon"><i class="bi bi-file-earmark"></i></span>
                    <span class="fs-4 text-muted" id="file-label">Choose a file or drag it here</span>
                </div>
            </div>
            
            <input type="file" class="d-none" id="input" />
        </label>

        <label id="text-area" style="display: none;">
            <textarea id="text-input" class="form-control border-1" placeholder="Enter text here" style="width: 800px; height: 400px; max-width: 90vw; max-height: 40vh;"></textarea>
        </label>

        <label class="mt-3 w-100">
            Auto Delete
            <select class="form-select" aria-label="Auto delete" id="select">
                <option value="50Y">50 Years</option>
                <option value="1Y">1 Year</option>
                <option value="1M">1 Month</option>
                <option selected value="7D">7 Days</option>
                <option value="24H">24 Hours</option>
                <option value="3H">3 Hours</option>
                <option value="1Min">1 Minute</option>
            </select>
        </label>

        <button class="btn btn-primary mt-3" id="btn">Upload</button>

        <div class="progress w-100 mt-3" role="progressbar" aria-label="Upload progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="display: none; height: 20px;" id="progress">
            <div class="progress-bar" style="width: 0%" id="progress-bar"></div>
        </div>

    </div>
</div>

<script nonce="<?php echo $nonce ?>">

$(function() {
    /** @type {File | null} */
    let file = null;
    let is_file_upload = true;
    let uploading = false;

    $("#nav-file").on("click", function() {
        if (uploading) return;
        is_file_upload = true;
        $("#nav-file").addClass("active");
        $("#nav-text").removeClass("active");
        $("#file-area").show();
        $("#text-area").hide();
    });

    $("#nav-text").on("click", function() {
        if (uploading) return;
        is_file_upload = false;
        clearFile();
        $("#nav-text").addClass("active");
        $("#nav-file").removeClass("active");
        $("#file-area").hide();
        $("#text-area").show();
    });

    function getIconClass(mimeType) {
        if (!mimeType) return "bi-file-earmark";
        if (mimeType === "application/pdf") return "bi-file-earmark-pdf";
        if (mimeType.match(/^application\/(zip|x-zip|gzip|x-gzip|x-tar|x-bzip2|x-7z|x-rar|x-compress)/)) return "bi-file-earmark-zip";
        if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "bi-file-earmark-play";
        if (mimeType.startsWith("image/")) return "bi-file-earmark-image";
        if (mimeType.startsWith("text/") || mimeType.match(/^application\/(json|xml|javascript|typescript)/)) return "bi-file-earmark-text";
        return "bi-file-earmark";
    }

    function setFile(f) {
        file = f;
        $("#file-icon").show().removeClass("text-muted").find("i").attr("class", "bi " + getIconClass(f.type));
        $("#file-label").removeClass("text-muted").text(f.name);
    }

    function clearFile() {
        file = null;
        $("#file-icon").hide().addClass("text-muted");
        $("#file-label").addClass("text-muted").text("Choose a file or drag it here");
    }

    $("#input").on("change", function() {
        if (uploading) return;
        if ($("#input")[0].files[0]) {
            setFile($("#input")[0].files[0]);
        } else {
            clearFile();
        }
    })

    // drag and drop

    let dragCounter = 0;

    $(window).on("dragover", function(e) {
        e.preventDefault();
        e.stopPropagation();
    });

    $(window).on("dragenter", function(e) {
        e.preventDefault();
        if (uploading) return;
        dragCounter++;
        $("#file-card").addClass("border border-primary border-3");
    });

    $(window).on("dragleave", function(e) {
        e.preventDefault();
        if (uploading) return;
        dragCounter--;
        if (dragCounter === 0) {
            $("#file-card").removeClass("border border-primary border-3");
        }
    });

    $(window).on("drop", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (uploading) return;
        dragCounter = 0;
        $("#file-card").removeClass("border border-primary border-3");
        const dt = e.originalEvent.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
            setFile(dt.files[0]);
        }
    });

    // upload


    $("#btn").on("click", async function() {
        const text = new TextEncoder().encode($("#text-input").val().trim());
        if (uploading) return;
        if (!file && is_file_upload) return;
        if (!is_file_upload && text.length === 0) return;
        uploading = true;

        // Hide controls and disable interactions
        $("#btn").hide();
        $("#select").closest("label").hide();
        $("#input").prop("disabled", true);
        $("#progress").show();
        $("#progress-bar").css("width", "0%");
        $("#progress").attr("aria-valuenow", "0");
        $("#text-input").prop("disabled", true);

        try {
            const totalSize = is_file_upload ? file.size : text.length;
            let uploaded = 0;

            const w = new Writer();
            if (is_file_upload) {
                await w.start(file.size, file.name, file.type, $("#select").val());
            } else {
                await w.start(text.length, new Date().toISOString() + ".txt", "text/plain", $("#select").val());
            }

            if (!is_file_upload) {

                await w.write(text);
                $("#progress-bar").css("width", "100%");
                $("#progress").attr("aria-valuenow", "100");

            } else {

                for (let i = 0; i < file.size; i += 4096) {
                    const end = Math.min(file.size, i + 4096);
                    const data = await file.slice(i, end).bytes();
                    await w.write(data);
                    uploaded = end;
                    const pct = Math.round((uploaded / totalSize) * 100);
                    $("#progress-bar").css("width", pct + "%");
                    $("#progress").attr("aria-valuenow", pct);
                }

            }

            await w.close();
            $("#progress-bar").css("width", "100%");
            $("#progress").attr("aria-valuenow", "100");

            const url = "/d?" + w.filename + "#" + w.password;
            console.log(url);
            location.href = url;

        } catch (e) {
            console.error(e);
            alert("Error: upload failed");
            uploading = false;
            $("#btn").show();
            $("#select").closest("label").show();
            $("#input").prop("disabled", false);
            clearFile();
            $("#progress").hide();
            $("#text-input").prop("disabled", false);
        }
    });
})

</script>
    
</body>
</html>