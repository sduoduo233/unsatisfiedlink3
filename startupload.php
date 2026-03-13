<?php

require_once "common.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Method Not Allowed"]);
    exit;
}

$expire_duration = "7D";
if (isset($_POST["expires"]) && is_string($_POST["expires"])) {
    $expire_duration = $_POST["expires"];
}

if ($expire_duration === "50Y") {
    $expire_interval = "P50Y";
} else if ($expire_duration === "1Y") {
    $expire_interval = "P1Y";
} else if ($expire_duration === "1M") {
    $expire_interval = "P1M";
} else if ($expire_duration === "7D") {
    $expire_interval = "P7D";
} else if ($expire_duration === "24H") {
    $expire_interval = "PT24H";
} else if ($expire_duration === "3H") {
    $expire_interval = "PT3H";
} else if ($expire_duration === "1Min") {
    $expire_interval = "PT1M";
} else {
    http_response_code(400);
    echo json_encode(["error" => "Invalid expires value"]);
    exit;
}

$expires_at = (new DateTime())->add(new DateInterval($expire_interval))->format("Y-m-d H:i:s");

$filename = random_string(8);
$admin_password = random_string(14);

// Insert into database
sqlite_exec("INSERT INTO files (filename, finished_at, uploader_ip, admin_password, expires_at) VALUES (?, NULL, ?, ?, ?)",[$filename, $_SERVER['REMOTE_ADDR'], password_hash($admin_password, PASSWORD_ARGON2I), $expires_at]);

$target_file = __DIR__ . "/uploads_tmp/" . $filename;

file_put_contents($target_file, "", LOCK_EX);

echo json_encode(["message" => "OK", "filename" => $filename, "admin_password" => $admin_password]);