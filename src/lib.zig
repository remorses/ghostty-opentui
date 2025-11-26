const std = @import("std");
const ghostty_vt = @import("ghostty-vt");
const color = ghostty_vt.color;
const pagepkg = ghostty_vt.page;

// Disable all logging from ghostty-vt library
pub const std_options: std.Options = .{
    .log_level = .err,
    .logFn = struct {
        pub fn logFn(
            comptime _: std.log.Level,
            comptime _: @Type(.enum_literal),
            comptime _: []const u8,
            _: anytype,
        ) void {}
    }.logFn,
};

pub const StyleFlags = packed struct(u8) {
    bold: bool = false,
    italic: bool = false,
    underline: bool = false,
    strikethrough: bool = false,
    inverse: bool = false,
    faint: bool = false,
    _padding: u2 = 0,

    pub fn toInt(self: StyleFlags) u8 {
        return @bitCast(self);
    }

    pub fn eql(self: StyleFlags, other: StyleFlags) bool {
        return self.toInt() == other.toInt();
    }
};

pub const CellStyle = struct {
    fg: ?color.RGB,
    bg: ?color.RGB,
    flags: StyleFlags,

    pub fn eql(self: CellStyle, other: CellStyle) bool {
        const fg_eq = if (self.fg) |a| (if (other.fg) |b| a.r == b.r and a.g == b.g and a.b == b.b else false) else other.fg == null;
        const bg_eq = if (self.bg) |a| (if (other.bg) |b| a.r == b.r and a.g == b.g and a.b == b.b else false) else other.bg == null;
        return fg_eq and bg_eq and self.flags.eql(other.flags);
    }
};

fn getStyleFromCell(
    cell: *const pagepkg.Cell,
    pin: ghostty_vt.Pin,
    palette: *const color.Palette,
    terminal_bg: ?color.RGB,
) CellStyle {
    var flags: StyleFlags = .{};
    var fg: ?color.RGB = null;
    var bg: ?color.RGB = null;

    const style = pin.style(cell);

    flags.bold = style.flags.bold;
    flags.italic = style.flags.italic;
    flags.faint = style.flags.faint;
    flags.inverse = style.flags.inverse;
    flags.strikethrough = style.flags.strikethrough;
    flags.underline = style.flags.underline != .none;

    fg = switch (style.fg_color) {
        .none => null,
        .palette => |idx| palette[idx],
        .rgb => |rgb| rgb,
    };

    bg = style.bg(cell, palette) orelse switch (cell.content_tag) {
        .bg_color_palette => palette[cell.content.color_palette],
        .bg_color_rgb => .{ .r = cell.content.color_rgb.r, .g = cell.content.color_rgb.g, .b = cell.content.color_rgb.b },
        else => null,
    };

    // If the background color matches the terminal's default background, treat it as transparent
    if (bg) |cell_bg| {
        if (terminal_bg) |term_bg| {
            if (cell_bg.r == term_bg.r and cell_bg.g == term_bg.g and cell_bg.b == term_bg.b) {
                bg = null;
            }
        }
    }

    return .{ .fg = fg, .bg = bg, .flags = flags };
}

fn writeJsonString(writer: anytype, s: []const u8) !void {
    try writer.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => {
                if (c < 0x20) {
                    try writer.print("\\u{x:0>4}", .{c});
                } else {
                    try writer.writeByte(c);
                }
            },
        }
    }
    try writer.writeByte('"');
}

fn writeColor(writer: anytype, rgb: ?color.RGB) !void {
    if (rgb) |c| {
        try writer.print("\"#{x:0>2}{x:0>2}{x:0>2}\"", .{ c.r, c.g, c.b });
    } else {
        try writer.writeAll("null");
    }
}

pub fn writeJsonOutput(
    writer: anytype,
    t: *ghostty_vt.Terminal,
    offset: usize,
    limit: ?usize,
) !void {
    const screen = t.screens.active;
    const palette = &t.colors.palette.current;
    const terminal_bg = t.colors.background.get();

    var total_lines: usize = 0;
    var count_iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    while (count_iter.next()) |_| {
        total_lines += 1;
    }

    try writer.writeAll("{");
    try writer.print("\"cols\":{},\"rows\":{},", .{ screen.pages.cols, screen.pages.rows });
    try writer.print("\"cursor\":[{},{}],", .{ screen.cursor.x, screen.cursor.y });
    try writer.print("\"offset\":{},\"totalLines\":{},", .{ offset, total_lines });
    try writer.writeAll("\"lines\":[");

    var text_buf: [4096]u8 = undefined;
    var row_iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    var row_idx: usize = 0;
    var output_idx: usize = 0;

    while (row_iter.next()) |pin| {
        if (row_idx < offset) {
            row_idx += 1;
            continue;
        }

        if (limit) |lim| {
            if (output_idx >= lim) break;
        }

        if (output_idx > 0) try writer.writeByte(',');
        try writer.writeByte('[');

        const cells = pin.cells(.all);
        var span_start: usize = 0;
        var span_len: usize = 0;
        var current_style: ?CellStyle = null;
        var text_len: usize = 0;
        var span_idx: usize = 0;

        for (cells, 0..) |*cell, col_idx| {
            if (cell.wide == .spacer_tail) continue;

            const cp = cell.codepoint();
            const is_null = cp == 0;

            if (is_null) {
                if (text_len > 0) {
                    if (span_idx > 0) try writer.writeByte(',');
                    try writer.writeByte('[');
                    try writeJsonString(writer, text_buf[0..text_len]);
                    try writer.writeByte(',');
                    try writeColor(writer, current_style.?.fg);
                    try writer.writeByte(',');
                    try writeColor(writer, current_style.?.bg);
                    try writer.print(",{},{}", .{ current_style.?.flags.toInt(), span_len });
                    try writer.writeByte(']');
                    span_idx += 1;
                    text_len = 0;
                    span_len = 0;
                }
                current_style = null;
                continue;
            }

            const style = getStyleFromCell(cell, pin, palette, terminal_bg);
            const style_changed = if (current_style) |cs| !cs.eql(style) else true;

            if (style_changed and text_len > 0) {
                if (span_idx > 0) try writer.writeByte(',');
                try writer.writeByte('[');
                try writeJsonString(writer, text_buf[0..text_len]);
                try writer.writeByte(',');
                try writeColor(writer, current_style.?.fg);
                try writer.writeByte(',');
                try writeColor(writer, current_style.?.bg);
                try writer.print(",{},{}", .{ current_style.?.flags.toInt(), span_len });
                try writer.writeByte(']');
                span_idx += 1;
                text_len = 0;
                span_len = 0;
            }

            if (style_changed) {
                span_start = col_idx;
                current_style = style;
            }

            const cp21: u21 = @intCast(cp);
            const len = std.unicode.utf8CodepointSequenceLength(cp21) catch 1;
            if (text_len + len <= text_buf.len) {
                _ = std.unicode.utf8Encode(cp21, text_buf[text_len..]) catch 0;
                text_len += len;
            }

            span_len += if (cell.wide == .wide) 2 else 1;
        }

        if (text_len > 0) {
            if (span_idx > 0) try writer.writeByte(',');
            try writer.writeByte('[');
            try writeJsonString(writer, text_buf[0..text_len]);
            try writer.writeByte(',');
            try writeColor(writer, current_style.?.fg);
            try writer.writeByte(',');
            try writeColor(writer, current_style.?.bg);
            try writer.print(",{},{}", .{ current_style.?.flags.toInt(), span_len });
            try writer.writeByte(']');
        }

        try writer.writeByte(']');
        row_idx += 1;
        output_idx += 1;
    }

    try writer.writeAll("]}");
}

var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
const globalArena = arena.allocator();

export fn ptyToJson(
    input_ptr: [*]const u8,
    input_len: usize,
    cols: u16,
    rows: u16,
    offset: usize,
    limit: usize,
    out_len: *usize,
) ?[*]u8 {
    const input = input_ptr[0..input_len];
    const lim: ?usize = if (limit == 0) null else limit;

    var t: ghostty_vt.Terminal = ghostty_vt.Terminal.init(globalArena, .{ .cols = cols, .rows = rows }) catch return null;
    defer t.deinit(globalArena);

    // Enable linefeed mode so LF (\n) also performs carriage return (moves to column 0)
    // This matches expected behavior when processing text files that use \n for newlines
    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    stream.nextSlice(input) catch return null;

    var output: std.ArrayListAligned(u8, null) = .empty;
    writeJsonOutput(output.writer(globalArena), &t, offset, lim) catch return null;

    out_len.* = output.items.len;
    return output.items.ptr;
}

export fn freeArena() void {
    _ = arena.reset(.free_all);
}

const testing = std.testing;

test "basic JSON output" {
    const alloc = testing.allocator;

    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = 80, .rows = 24 });
    defer t.deinit(alloc);

    var stream = t.vtStream();
    defer stream.deinit();

    try stream.nextSlice("Hello");

    var output: std.ArrayListAligned(u8, null) = .empty;
    defer output.deinit(alloc);

    try writeJsonOutput(output.writer(alloc), &t, 0, null);

    const json = output.items;
    try testing.expect(std.mem.indexOf(u8, json, "\"cols\":80") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"totalLines\":") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"Hello\"") != null);
}
