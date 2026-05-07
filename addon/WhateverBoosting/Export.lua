WB = WB or {}

function WB.BuildExportString()
    local db = WhateverBoostingDB
    if not db or not db.characters then return nil, "No data" end

    local chars = {}
    for _, data in pairs(db.characters) do
        if data.tracked then
            local char = {
                name      = data.name,
                class     = data.class,
                main_role = data.main_role,
                rating    = data.rating,
                item_level = data.item_level,
            }
            if data.off_role and data.off_role ~= "" then
                char.off_role = data.off_role
            end
            if data.current_key_dungeon and data.current_key_dungeon ~= "" then
                char.current_key_dungeon = data.current_key_dungeon
            end
            if data.current_key_map_id then
                char.current_key_map_id = data.current_key_map_id
            end
            if data.current_key_level then
                char.current_key_level = data.current_key_level
            end
            chars[#chars+1] = char
        end
    end

    if #chars == 0 then return nil, "No tracked characters to export" end

    local payload = {
        v = 1,
        exported_at = date("!%Y-%m-%dT%H:%M:%SZ"),
        characters = chars,
    }

    local json    = WB_JSONEncode(payload)
    local encoded = WB_Base64Encode(json)
    return "WB1|" .. encoded
end
