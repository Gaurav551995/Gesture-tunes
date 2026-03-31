param(
    [int]$Port = 8000
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "Serving Gesture Tunes from $root at http://localhost:$Port"
Write-Host "Press Ctrl+C in this window to stop the server."

$contentTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js" = "application/javascript; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png" = "image/png"
    ".jpg" = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg" = "image/svg+xml"
    ".ico" = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))

        if ([string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = "index.html"
        }

        $safeRelativePath = $requestPath -replace "/", "\"
        $fullPath = Join-Path $root $safeRelativePath

        if ((Test-Path $fullPath -PathType Leaf) -and $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $context.Response.StatusCode = 200
            $context.Response.ContentType = $contentTypes[$extension]
            if (-not $context.Response.ContentType) {
                $context.Response.ContentType = "application/octet-stream"
            }
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
            $context.Response.StatusCode = 404
            $context.Response.ContentType = "text/plain; charset=utf-8"
            $context.Response.ContentLength64 = $body.Length
            $context.Response.OutputStream.Write($body, 0, $body.Length)
        }

        $context.Response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
