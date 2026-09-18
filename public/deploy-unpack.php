<?php
/**
 * Sara Textiles Production Deploy Unpacker
 * Location: /httpdocs/public/deploy-unpack.php
 */
header('Content-Type: text/plain');

$SECRET = 'sara_deploy_secret_key_2026';
$providedKey = isset($_GET['key']) ? $_GET['key'] : (isset($_POST['key']) ? $_POST['key'] : '');

if ($providedKey !== $SECRET) {
    http_response_code(403);
    die("FORBIDDEN: Invalid key\n");
}

// Document root is /httpdocs/public, so app directory is parent (/httpdocs)
$publicDir = __DIR__;
$appDir = dirname($publicDir);

$zipFile = $appDir . '/sara-build.zip';
if (!file_exists($zipFile)) {
    $zipFile = $publicDir . '/sara-build.zip';
}

if (!file_exists($zipFile)) {
    http_response_code(404);
    die("NOT_FOUND: sara-build.zip not found at $zipFile\n");
}

$extracted = false;

if (class_exists('ZipArchive')) {
    $zip = new ZipArchive();
    if ($zip->open($zipFile) === TRUE) {
        $zip->extractTo($appDir);
        $zip->close();
        @unlink($zipFile);
        $extracted = true;
    }
}

if (!$extracted) {
    exec("unzip -o $zipFile -d $appDir 2>&1", $out, $ret);
    if ($ret === 0) {
        @unlink($zipFile);
        $extracted = true;
    }
}

if ($extracted) {
    // Restart Node.js Passenger process
    $tmpDir = $appDir . '/tmp';
    if (!is_dir($tmpDir)) {
        @mkdir($tmpDir, 0755, true);
    }
    @touch($tmpDir . '/restart.txt');
    echo "SUCCESS: Production build extracted and Passenger restarted in " . round(microtime(true) - $_SERVER["REQUEST_TIME_FLOAT"], 2) . "s\n";
} else {
    http_response_code(500);
    die("ERROR: Failed to extract sara-build.zip\n");
}
