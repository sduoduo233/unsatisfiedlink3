<?php

// delete expired files

require_once "common.php";

$now = (new DateTime())->format("Y-m-d H:i:s");
$expired_files = sqlite_query("SELECT * FROM files WHERE expires_at <= ?", [$now]);
foreach ($expired_files as $file) {
    $filename = $file["filename"];
    sqlite_exec("DELETE FROM files WHERE filename = ?", [$filename]);
    @unlink(__DIR__ . "/uploads/" . $filename);
    @unlink(__DIR__ . "/uploads_tmp/" . $filename);
}

// delete unfinished uploads that are older than 1 day

$one_day_ago = (new DateTime())->sub(new DateInterval("P1D"))->format("Y-m-d H:i:s");
$unfinished_files = sqlite_query("SELECT * FROM files WHERE finished_at IS NULL AND created_at <= ?", [$one_day_ago]);
foreach ($unfinished_files as $file) {
    $filename = $file["filename"];
    sqlite_exec("DELETE FROM files WHERE filename = ?", [$filename]);
    @unlink(__DIR__ . "/uploads/" . $filename);
    @unlink(__DIR__ . "/uploads_tmp/" . $filename);
}