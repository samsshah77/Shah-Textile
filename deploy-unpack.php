<?php
/**
 * Sara Textiles CI/CD Instant Unpacker
 * Unpacks the single production bundle and restarts Passenger / Node.js in < 1 second.
 */
header('Content-Type: text/plain');

$SECRET = 'sara_deploy_secret_key_2026';
$providedKey = isset($_GET['key']) ? $_GET['key'] : (isset($_POST['key']) ? $_POST['key'] : '');

if ($providedKey !== $SECRET) {
    http_response_code(403);
    die("FORBIDDEN: Invalid authentication key.\n");
}

$dir = __DIR__;
$zipFile = $dir . '/sara-build.zip';

if (!file_exists($zipFile)) {
    // Check if in parent directory
    if (file_exists(dirname($dir) . '/sara-build.zip')) {
        $zipFile = dirname($dir) . '/sara-build.zip';
        $dir = dirname($dir);
    }
}

if (!file_exists($zipFile)) {
    http_response_code(404);
    die("NOT_FOUND: sara-build.zip does not exist in $dir\n");
}

if (!class_exists('ZipArchive')) {
    // Fallback if ZipArchive PHP extension is disabled: use shell unzip
    exec("unzip -o $zipFile -d $dir 2>&1", $out, $ret);
    if ($ret === 0) {
        @unlink($zipFile);
        restartServer($dir);
        echo "SUCCESS: Extracted via shell unzip in " . round(microtime(true) - $_SERVER["REQUEST_TIME_FLOAT"], 2) . "s\n";
        exit(0);
    }
    http_response_code(500);
    die("ERROR: ZipArchive not available and shell unzip failed.\n" . implode("\n", $out));
}

$zip = new ZipArchive();
if ($zip->open($zipFile) === TRUE) {
    $zip->extractTo($dir);
    $zip->close();
    @unlink($zipFile);
    
    restartServer($dir);
    echo "SUCCESS: Production build extracted successfully in " . round(microtime(true) - $_SERVER["REQUEST_TIME_FLOAT"], 2) . "s\n";
} else {
    http_response_code(500);
    die("ERROR: Failed to open sara-build.zip.\n");
}

function restartServer($baseDir) {
    $tmpDir = $baseDir . '/tmp';
    if (!is_dir($tmpDir)) {
        @mkdir($tmpDir, 0755, true);
    }
    @touch($tmpDir . '/restart.txt');
}
