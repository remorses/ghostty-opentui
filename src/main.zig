const std = @import("std");
const ghostty_vt = @import("ghostty-vt");
const color = ghostty_vt.color;
const pagepkg = ghostty_vt.page;
const testing = std.testing;

const usage =
    \\Usage: pty-to-json [OPTIONS] [FILE]
    \\
    \\Convert a raw PTY log file to JSON with styled terminal output.
    \\
    \\If FILE is not provided, reads from stdin.
    \\
    \\Options:
    \\  -c, --cols N         Terminal width in columns (default: 120)
    \\  -r, --rows N         Terminal height in rows (default: 40)
    \\  -o, --output FILE    Write output to FILE instead of stdout
    \\  --offset N           Start from line N (0 = first line, for pagination)
    \\  --limit N            Maximum number of lines to output (default: all)
    \\  -h, --help           Show this help message
    \\
    \\JSON Output Format:
    \\  {
    \\    "cols": 80,
    \\    "rows": 24,
    \\    "cursor": [x, y],
    \\    "offset": 0,
    \\    "totalLines": 100,
    \\    "lines": [
    \\      [["text", "#fg", "#bg", flags, width], ...]
    \\    ]
    \\  }
    \\
    \\  Consecutive cells with same style are merged into spans.
    \\  flags: bold=1, italic=2, underline=4, strikethrough=8, inverse=16, faint=32
    \\
;

const StyleFlags = packed struct(u8) {
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

const CellStyle = struct {
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

fn writeJsonOutput(
    writer: anytype,
    t: *ghostty_vt.Terminal,
    offset: usize,
    limit: ?usize,
) !void {
    const screen = t.screens.active;
    const palette = &t.colors.palette.current;

    // Count total lines
    var total_lines: usize = 0;
    var count_iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    while (count_iter.next()) |_| {
        total_lines += 1;
    }

    try writer.writeAll("{");

    // Write dimensions
    try writer.print("\"cols\":{},\"rows\":{},", .{ screen.pages.cols, screen.pages.rows });

    // Write cursor position
    try writer.print("\"cursor\":[{},{}],", .{ screen.cursor.x, screen.cursor.y });

    // Write pagination info
    try writer.print("\"offset\":{},\"totalLines\":{},", .{ offset, total_lines });

    // Write lines
    try writer.writeAll("\"lines\":[");

    var text_buf: [4096]u8 = undefined;

    var row_iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    var row_idx: usize = 0;
    var output_idx: usize = 0;

    while (row_iter.next()) |pin| {
        // Skip rows before offset
        if (row_idx < offset) {
            row_idx += 1;
            continue;
        }

        // Stop if we've reached the limit
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
            // Skip spacer cells (wide char continuations)
            if (cell.wide == .spacer_tail) continue;

            const cp = cell.codepoint();
            
            // Truly empty cells (codepoint 0) end the current span
            // but spaces (codepoint 32) are preserved in text
            const is_null = cp == 0;

            if (is_null) {
                // Write current span if we have text
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

            const style = getStyleFromCell(cell, pin, palette);

            // Check if style changed - need to start a new span
            const style_changed = if (current_style) |cs| !cs.eql(style) else true;

            if (style_changed and text_len > 0) {
                // Write previous span
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

            // Encode codepoint to UTF-8 (including spaces!)
            const cp21: u21 = @intCast(cp);
            const len = std.unicode.utf8CodepointSequenceLength(cp21) catch 1;
            if (text_len + len <= text_buf.len) {
                _ = std.unicode.utf8Encode(cp21, text_buf[text_len..]) catch 0;
                text_len += len;
            }

            span_len += if (cell.wide == .wide) 2 else 1;
        }

        // Write final span
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

pub fn main() !void {
    var gpa: std.heap.DebugAllocator(.{}) = .init;
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    var cols: u16 = 120;
    var rows: u16 = 40;
    var input_file: ?[]const u8 = null;
    var output_file: ?[]const u8 = null;
    var offset: usize = 0;
    var limit: ?usize = null;

    const args = try std.process.argsAlloc(alloc);
    defer std.process.argsFree(alloc, args);

    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const arg = args[i];
        if (std.mem.eql(u8, arg, "-h") or std.mem.eql(u8, arg, "--help")) {
            var buf: [4096]u8 = undefined;
            var stdout_writer = std.fs.File.stdout().writer(&buf);
            try stdout_writer.interface.writeAll(usage);
            try stdout_writer.interface.flush();
            return;
        } else if (std.mem.eql(u8, arg, "-c") or std.mem.eql(u8, arg, "--cols")) {
            i += 1;
            if (i >= args.len) {
                std.debug.print("Error: --cols requires an argument\n", .{});
                std.process.exit(1);
            }
            cols = std.fmt.parseInt(u16, args[i], 10) catch {
                std.debug.print("Error: invalid column count: {s}\n", .{args[i]});
                std.process.exit(1);
            };
        } else if (std.mem.eql(u8, arg, "-r") or std.mem.eql(u8, arg, "--rows")) {
            i += 1;
            if (i >= args.len) {
                std.debug.print("Error: --rows requires an argument\n", .{});
                std.process.exit(1);
            }
            rows = std.fmt.parseInt(u16, args[i], 10) catch {
                std.debug.print("Error: invalid row count: {s}\n", .{args[i]});
                std.process.exit(1);
            };
        } else if (std.mem.eql(u8, arg, "-o") or std.mem.eql(u8, arg, "--output")) {
            i += 1;
            if (i >= args.len) {
                std.debug.print("Error: --output requires an argument\n", .{});
                std.process.exit(1);
            }
            output_file = args[i];
        } else if (std.mem.eql(u8, arg, "--offset")) {
            i += 1;
            if (i >= args.len) {
                std.debug.print("Error: --offset requires an argument\n", .{});
                std.process.exit(1);
            }
            offset = std.fmt.parseInt(usize, args[i], 10) catch {
                std.debug.print("Error: invalid offset: {s}\n", .{args[i]});
                std.process.exit(1);
            };
        } else if (std.mem.eql(u8, arg, "--limit")) {
            i += 1;
            if (i >= args.len) {
                std.debug.print("Error: --limit requires an argument\n", .{});
                std.process.exit(1);
            }
            limit = std.fmt.parseInt(usize, args[i], 10) catch {
                std.debug.print("Error: invalid limit: {s}\n", .{args[i]});
                std.process.exit(1);
            };
        } else if (arg[0] != '-') {
            input_file = arg;
        } else {
            std.debug.print("Error: unknown option: {s}\n", .{arg});
            std.process.exit(1);
        }
    }

    // Create terminal
    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = cols, .rows = rows });
    defer t.deinit(alloc);

    // Process VT stream
    var stream = t.vtStream();
    defer stream.deinit();

    var buf: [65536]u8 = undefined;
    if (input_file) |path| {
        const file = std.fs.cwd().openFile(path, .{}) catch |err| {
            std.debug.print("Error opening file '{s}': {}\n", .{ path, err });
            std.process.exit(1);
        };
        defer file.close();

        while (true) {
            const n = try file.readAll(&buf);
            if (n == 0) break;
            try stream.nextSlice(buf[0..n]);
        }
    } else {
        const stdin = std.fs.File.stdin();
        while (true) {
            const n = try stdin.readAll(&buf);
            if (n == 0) break;
            try stream.nextSlice(buf[0..n]);
        }
    }

    // Write JSON output
    const output: std.fs.File = if (output_file) |path|
        std.fs.cwd().createFile(path, .{}) catch |err| {
            std.debug.print("Error creating output file '{s}': {}\n", .{ path, err });
            std.process.exit(1);
        }
    else
        std.fs.File.stdout();
    defer if (output_file != null) output.close();

    var out_buf: [8192]u8 = undefined;
    var out_writer = output.writer(&out_buf);
    try writeJsonOutput(&out_writer.interface, &t, offset, limit);
    try out_writer.interface.flush();
}

test "basic JSON output" {
    const alloc = testing.allocator;

    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = 80, .rows = 24 });
    defer t.deinit(alloc);

    var stream = t.vtStream();
    defer stream.deinit();

    try stream.nextSlice("Hello");

    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(alloc);

    try writeJsonOutput(output.writer(alloc), &t, 0, null);

    const json = output.items;
    try testing.expect(std.mem.indexOf(u8, json, "\"cols\":80") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"totalLines\":") != null);
    try testing.expect(std.mem.indexOf(u8, json, "\"Hello\"") != null);
}
