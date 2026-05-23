// Scripting APP 专用 BoxJs 全接口跨域重写脚本
const boxjsUrls = [
    "boxjs.com/api/boxjs/get",
    "boxjs.com/api/boxjs/set",
    "boxjs.com/query/data",
    "boxjs.com/update/data"
];
const isBoxJsRequest = boxjsUrls.some(url => $request.url.indexOf(url) > -1);

if (isBoxJsRequest) {
    const res = {
        headers: {
            ...$response.headers,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Max-Age": "86400"
        },
        body: $response.body
    };
    $done(res);
} else {
    $done($response);
}