<?php
// Handle consignment form submissions without relying on third-party services.

declare(strict_types=1);

// Configuration
$recipientEmail = 'ChangingPlacesDSM@gmail.com';
$recipientName = 'Changing Places Consignment';
$fromEmail = 'no-reply@changing-places-dsm.com';
$maxFiles = 20;
$maxFileSize = 10 * 1024 * 1024; // 10 MB per file
$maxTotalSize = 20 * 1024 * 1024; // 20 MB combined
$maxRequestSize = 25 * 1024 * 1024; // Extra room for form fields and multipart overhead
$maxNameLength = 100;
$maxPhoneLength = 40;
$maxEmailLength = 254;
$maxDescriptionLength = 5000;
$rateLimitWindowSeconds = 60 * 60;
$rateLimitMaxSubmissions = 5;
$allowedMimeTypes = [
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/jpg',
    'image/png',
];

$expectsJson = isset($_SERVER['HTTP_ACCEPT']) && stripos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

function respond(bool $success, string $message, int $statusCode = 200, bool $expectsJson = false): void
{
    http_response_code($statusCode);

    if ($expectsJson) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'success' => $success,
            'message' => $message,
        ]);
    } else {
        $escapedMessage = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Consignment Submission</title>";
        echo '<meta name="viewport" content="width=device-width, initial-scale=1" />';
        echo '</head><body style="font-family: Arial, sans-serif; margin: 2rem;">';
        echo '<h1>Consignment Submission</h1>';
        echo '<p>' . $escapedMessage . '</p>';
        echo '<p><a href="consignment-form.html">Return to the form</a></p>';
        echo '</body></html>';
    }

    exit;
}

function textLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    return strlen($value);
}

function rateLimitExceeded(int $windowSeconds, int $maxSubmissions): bool
{
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
    $key = hash('sha256', $clientIp . '|' . $userAgent);
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'changing_places_rate_limit';

    // TODO: After deployment, confirm the host allows this temp directory to be created and written.
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        return false;
    }

    $path = $directory . DIRECTORY_SEPARATOR . $key . '.json';
    $handle = fopen($path, 'c+');

    if (!$handle) {
        return false;
    }

    $locked = false;

    try {
        $locked = flock($handle, LOCK_EX);
        if (!$locked) {
            return false;
        }

        $contents = stream_get_contents($handle);
        $timestamps = [];
        if (is_string($contents) && $contents !== '') {
            $decoded = json_decode($contents, true);
            if (is_array($decoded)) {
                $timestamps = array_values(array_filter(
                    $decoded,
                    static fn($timestamp): bool => is_int($timestamp) || ctype_digit((string)$timestamp)
                ));
            }
        }

        $now = time();
        $timestamps = array_values(array_filter(
            $timestamps,
            static fn($timestamp): bool => (int)$timestamp >= $now - $windowSeconds
        ));

        if (count($timestamps) >= $maxSubmissions) {
            return true;
        }

        $timestamps[] = $now;
        ftruncate($handle, 0);
        rewind($handle);
        $encodedTimestamps = json_encode($timestamps);
        if (is_string($encodedTimestamps)) {
            fwrite($handle, $encodedTimestamps);
        }

        return false;
    } finally {
        if ($locked) {
            flock($handle, LOCK_UN);
        }
        fclose($handle);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Unsupported request method.', 405, $expectsJson);
}

$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > $maxRequestSize) {
    respond(false, 'Please keep the combined photo size under 20 MB.', 413, $expectsJson);
}

if (isset($_POST['website']) && trim((string)$_POST['website']) !== '') {
    respond(true, 'Thanks! We have your details and will be in touch soon.', 200, $expectsJson);
}

// TODO: After deployment, monitor spam volume and add Turnstile/reCAPTCHA if this is not enough.
if (rateLimitExceeded($rateLimitWindowSeconds, $rateLimitMaxSubmissions)) {
    respond(false, 'Too many submissions. Please wait a bit and try again.', 429, $expectsJson);
}

$requiredFields = ['name', 'phone', 'email', 'description'];
foreach ($requiredFields as $field) {
    if (!isset($_POST[$field]) || trim((string)$_POST[$field]) === '') {
        respond(false, 'Please complete all required fields.', 422, $expectsJson);
    }
}

$name = trim((string)$_POST['name']);
$phone = trim((string)$_POST['phone']);
$email = filter_var((string)$_POST['email'], FILTER_SANITIZE_EMAIL);
$description = trim((string)$_POST['description']);
$contactMethod = isset($_POST['contact-method']) ? trim((string)$_POST['contact-method']) : 'No preference';

if (
    textLength($name) > $maxNameLength ||
    textLength($phone) > $maxPhoneLength ||
    textLength($email) > $maxEmailLength ||
    textLength($description) > $maxDescriptionLength
) {
    respond(false, 'One or more fields is too long. Please shorten your submission and try again.', 422, $expectsJson);
}

$allowedContactMethods = ['text', 'email'];
$contactMethod = strtolower($contactMethod);
if (!in_array($contactMethod, $allowedContactMethods, true)) {
    $contactMethod = '';
}

$contactMethodLabel = match ($contactMethod) {
    'text' => 'Text',
    'email' => 'Email',
    default => 'No preference',
};

$sanitizeHeader = static fn(string $value): string => trim(str_replace(["\r", "\n"], '', $value));
$encodeHeader = static function (string $value): string {
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8');
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
};

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please provide a valid email address.', 422, $expectsJson);
}

$agreementAccepted = isset($_POST['agreement']);
if (!$agreementAccepted) {
    respond(false, 'You must confirm the consignment agreement.', 422, $expectsJson);
}

$attachments = [];
$totalSize = 0;
$finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;

if (!empty($_FILES['photos']) && is_array($_FILES['photos']['name'])) {
    if (!$finfo) {
        respond(false, 'File uploads are temporarily unavailable. Please email or text your photos instead.', 500, $expectsJson);
    }

    $fileCount = count(array_filter(
        $_FILES['photos']['name'],
        static fn($name) => $name !== ''
    ));
    if ($fileCount > $maxFiles) {
        respond(false, 'Please limit photo uploads to ' . $maxFiles . ' files.', 422, $expectsJson);
    }

    for ($i = 0; $i < $fileCount; $i++) {
        $error = $_FILES['photos']['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK) {
            respond(false, 'One or more photos could not be uploaded. Please try again.', 400, $expectsJson);
        }

        $tmpPath = $_FILES['photos']['tmp_name'][$i];
        $originalName = $_FILES['photos']['name'][$i];
        $size = (int)($_FILES['photos']['size'][$i] ?? 0);

        if (!is_uploaded_file($tmpPath)) {
            respond(false, 'Invalid upload detected.', 400, $expectsJson);
        }

        if ($size > $maxFileSize) {
            respond(false, 'Each photo must be 10 MB or smaller.', 422, $expectsJson);
        }

        $totalSize += $size;
        if ($totalSize > $maxTotalSize) {
            respond(false, 'Please keep the combined photo size under 20 MB.', 422, $expectsJson);
        }

        $detectedType = finfo_file($finfo, $tmpPath);
        $type = is_string($detectedType) ? strtolower($detectedType) : '';
        $isAllowedType = in_array(strtolower($type), $allowedMimeTypes, true);

        if (!$isAllowedType) {
            respond(false, 'Only JPG, JPEG, PNG, and HEIC image files may be uploaded.', 422, $expectsJson);
        }

        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$originalName) ?: 'photo.jpg';

        // TODO: After deployment, confirm encoded attachment emails stay under provider limits.
        $attachments[] = [
            'name' => $safeName,
            'type' => $type,
            'content' => chunk_split(base64_encode((string)file_get_contents($tmpPath))),
        ];
    }
}

if ($finfo) {
    finfo_close($finfo);
}

$subject = 'New consignment submission from ' . $sanitizeHeader($name);

$lines = [
    'You have received a new consignment inquiry from the website.',
    '',
    'Name: ' . $name,
    'Phone: ' . $phone,
    'Email: ' . $email,
    'Preferred Contact Method: ' . $contactMethodLabel,
    '',
    'Item Details:',
    $description,
];

$normalizeLineBreaks = static fn(string $value): string => preg_replace("/\r\n|\r|\n/", "\r\n", $value ?? '') ?? '';

$messageBodyLines = array_map($normalizeLineBreaks, $lines);
$messageBody = implode("\r\n", $messageBodyLines);

$boundary = '=====' . bin2hex(random_bytes(16)) . '=====';

$headers = [];
$headers[] = 'From: ' . $encodeHeader($recipientName) . ' <' . $fromEmail . '>';
$headers[] = 'Reply-To: ' . $sanitizeHeader($email);
$headers[] = 'MIME-Version: 1.0';

if ($attachments) {
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

    $body = '--' . $boundary . "\r\n";
    $body .= 'Content-Type: text/plain; charset="UTF-8"' . "\r\n";
    $body .= 'Content-Transfer-Encoding: 7bit' . "\r\n\r\n";
    $body .= $messageBody . "\r\n";

    foreach ($attachments as $attachment) {
        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Type: ' . $attachment['type'] . '; name="' . $attachment['name'] . '"' . "\r\n";
        $body .= 'Content-Transfer-Encoding: base64' . "\r\n";
        $body .= 'Content-Disposition: attachment; filename="' . $attachment['name'] . '"' . "\r\n\r\n";
        $body .= $attachment['content'] . "\r\n";
    }

    $body .= '--' . $boundary . "--\r\n";
} else {
    $headers[] = 'Content-Type: text/plain; charset="UTF-8"';
    $body = $messageBody;
}

$headersString = implode("\r\n", $headers);

$mailSent = mail($recipientEmail, $subject, $body, $headersString);

if ($mailSent) {
    respond(true, 'Thanks! We have your details and will be in touch soon.', 200, $expectsJson);
}

respond(false, 'We could not send your message. Please try again later.', 500, $expectsJson);
