local function encode(val)
    local t = type(val)
    if val == nil then
        return "null"
    elseif t == "boolean" then
        return val and "true" or "false"
    elseif t == "number" then
        if val ~= val or val == math.huge or val == -math.huge then return "null" end
        return string.format("%.14g", val)
    elseif t == "string" then
        local s = val
            :gsub('\\', '\\\\')
            :gsub('"',  '\\"')
            :gsub('\n', '\\n')
            :gsub('\r', '\\r')
            :gsub('\t', '\\t')
        return '"' .. s .. '"'
    elseif t == "table" then
        if #val > 0 then
            local items = {}
            for _, v in ipairs(val) do items[#items+1] = encode(v) end
            return "[" .. table.concat(items, ",") .. "]"
        else
            local pairs_list = {}
            for k, v in pairs(val) do
                if type(k) == "string" or type(k) == "number" then
                    pairs_list[#pairs_list+1] = encode(tostring(k)) .. ":" .. encode(v)
                end
            end
            return "{" .. table.concat(pairs_list, ",") .. "}"
        end
    end
    return "null"
end

function WB_JSONEncode(val)
    return encode(val)
end
