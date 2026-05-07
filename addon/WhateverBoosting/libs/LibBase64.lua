local CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function WB_Base64Encode(data)
    local result = {}
    local len = #data
    local i = 1
    while i <= len do
        local b0 = data:byte(i)
        local b1 = (i + 1 <= len) and data:byte(i + 1) or 0
        local b2 = (i + 2 <= len) and data:byte(i + 2) or 0
        local n  = b0 * 65536 + b1 * 256 + b2
        result[#result+1] = CHARS:sub(math.floor(n / 262144) % 64 + 1, math.floor(n / 262144) % 64 + 1)
        result[#result+1] = CHARS:sub(math.floor(n / 4096)   % 64 + 1, math.floor(n / 4096)   % 64 + 1)
        result[#result+1] = (i + 1 <= len) and CHARS:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1) or "="
        result[#result+1] = (i + 2 <= len) and CHARS:sub(n % 64 + 1, n % 64 + 1) or "="
        i = i + 3
    end
    return table.concat(result)
end
