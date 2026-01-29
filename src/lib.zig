const std = @import("std");
const builtin = @import("builtin");
const napigen = if (builtin.is_test) undefined else @import("napigen");
const ghostty_vt = @import("ghostty-vt");
const color = ghostty_vt.color;
const pagepkg = ghostty_vt.page;
const formatter = ghostty_vt.formatter;
const Screen = ghostty_vt.Screen;

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

/// Count total lines in terminal screen
fn countLines(screen: *Screen) usize {
    var total: usize = 0;
    var iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    while (iter.next()) |_| {
        total += 1;
    }
    return total;
}

/// Check if terminal has at least `threshold` lines - O(threshold) not O(total)
fn hasEnoughLines(screen: *Screen, threshold: usize) bool {
    var count: usize = 0;
    var iter = screen.pages.rowIterator(.right_down, .{ .screen = .{} }, null);
    while (iter.next()) |_| {
        count += 1;
        if (count >= threshold) return true;
    }
    return false;
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

    const total_lines = countLines(screen);

    // Check if cursor is visible (DECTCEM mode - DEC text cursor enable mode)
    const cursor_visible = t.modes.get(.cursor_visible);
    
    try writer.writeAll("{");
    try writer.print("\"cols\":{},\"rows\":{},", .{ screen.pages.cols, screen.pages.rows });
    try writer.print("\"cursor\":[{},{}],", .{ screen.cursor.x, screen.cursor.y });
    try writer.print("\"cursorVisible\":{},", .{ cursor_visible });
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

        // First pass: find the last column with actual content (non-null codepoint)
        // This allows us to trim trailing spaces while preserving internal spaces (e.g., from tabs)
        var last_content_col: usize = 0;
        for (cells, 0..) |*cell, col_idx| {
            if (cell.wide == .spacer_tail) continue;
            if (cell.codepoint() != 0) {
                last_content_col = col_idx + 1; // +1 because we want to include this column
            }
        }

        var span_start: usize = 0;
        var span_len: usize = 0;
        var current_style: ?CellStyle = null;
        var text_len: usize = 0;
        var span_idx: usize = 0;

        for (cells, 0..) |*cell, col_idx| {
            if (cell.wide == .spacer_tail) continue;
            // Stop at the last content column (trim trailing nulls/spaces)
            if (col_idx >= last_content_col) break;

            const raw_cp = cell.codepoint();
            // Treat null cells as spaces (important for tab expansion)
            // Null cells occur when cursor moves (e.g., tab) without writing characters
            const cp: u32 = if (raw_cp == 0) ' ' else raw_cp;

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

// Thread-local allocator for NAPI functions
// The arena is reset at the START of each NAPI call, allowing the previous call's
// return value to survive until napigen copies it to a JS string.
threadlocal var arena: std.heap.ArenaAllocator = std.heap.ArenaAllocator.init(std.heap.page_allocator);

fn getArenaAllocator() std.mem.Allocator {
    // Reset arena at the start of each call - this frees memory from the previous call
    // AFTER napigen has already copied the return value to JS
    _ = arena.reset(.retain_capacity);
    return arena.allocator();
}

// =============================================================================
// Persistent Terminal Management
// =============================================================================

/// The stream type returned by Terminal.vtStream()
const ReadonlyStream = @typeInfo(@TypeOf(ghostty_vt.Terminal.vtStream)).@"fn".return_type.?;

/// A persistent terminal instance
const PersistentTerminal = struct {
    terminal: ghostty_vt.Terminal,
    allocator: std.mem.Allocator,
    /// Persistent stream that maintains parser state across feed() calls.
    /// This is critical for handling ANSI escape sequences that may be split
    /// across multiple data chunks from the PTY.
    stream: ?ReadonlyStream,

    pub fn init(alloc: std.mem.Allocator, cols: u16, rows: u16) !PersistentTerminal {
        var terminal = try ghostty_vt.Terminal.init(alloc, .{
            .cols = cols,
            .rows = rows,
            .max_scrollback = std.math.maxInt(usize),
        });

        // Enable linefeed mode so LF (\n) also performs carriage return
        terminal.modes.set(.linefeed, true);

        return .{
            .terminal = terminal,
            .allocator = alloc,
            // Stream is created lazily in initStream() after the struct is at its final location.
            // This is necessary because the stream holds a pointer to the terminal.
            .stream = null,
        };
    }

    /// Initialize the stream after the struct has been placed at its final heap location.
    /// Must be called once after init() before any feed() calls.
    pub fn initStream(self: *PersistentTerminal) void {
        self.stream = self.terminal.vtStream();
    }

    pub fn deinit(self: *PersistentTerminal) void {
        if (self.stream) |*s| {
            s.deinit();
        }
        self.terminal.deinit(self.allocator);
    }

    pub fn feed(self: *PersistentTerminal, data: []const u8) !void {
        // Use the persistent stream to maintain parser state across calls.
        // This ensures that escape sequences split across multiple chunks
        // are parsed correctly.
        try self.stream.?.nextSlice(data);
    }

    /// Returns true if the parser is in ground state, meaning all escape
    /// sequences have been fully processed and it's safe to read terminal content.
    pub fn isReady(self: *const PersistentTerminal) bool {
        if (self.stream) |s| {
            return s.parser.state == .ground;
        }
        return true;
    }

    pub fn resize(self: *PersistentTerminal, cols: u16, rows: u16) !void {
        try self.terminal.resize(self.allocator, cols, rows);
    }

    pub fn reset(self: *PersistentTerminal) void {
        self.terminal.fullReset();
        // Recreate the stream to reset parser state
        if (self.stream) |*s| {
            s.deinit();
        }
        self.stream = self.terminal.vtStream();
    }
};

/// Global storage for persistent terminals
/// Uses a mutex for thread-safety since NAPI can call from different threads
var terminals_mutex: std.Thread.Mutex = .{};
var terminals: ?std.AutoHashMap(u32, *PersistentTerminal) = null;

fn getTerminalsMap() *std.AutoHashMap(u32, *PersistentTerminal) {
    if (terminals == null) {
        terminals = std.AutoHashMap(u32, *PersistentTerminal).init(std.heap.page_allocator);
    }
    return &terminals.?;
}

/// Create a new persistent terminal with the given ID
fn createTerminal(id: u32, cols: u32, rows: u32) !void {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();

    // If terminal with this ID already exists, destroy it first
    if (map.get(id)) |existing| {
        existing.deinit();
        std.heap.page_allocator.destroy(existing);
        _ = map.remove(id);
    }

    // Create new terminal
    const term_ptr = try std.heap.page_allocator.create(PersistentTerminal);
    errdefer std.heap.page_allocator.destroy(term_ptr);

    term_ptr.* = try PersistentTerminal.init(
        std.heap.page_allocator,
        @intCast(cols),
        @intCast(rows),
    );

    // Initialize the stream after the struct is at its final heap location.
    // This is critical because the stream holds a pointer to the terminal.
    term_ptr.initStream();

    try map.put(id, term_ptr);
}

/// Destroy a persistent terminal
fn destroyTerminal(id: u32) void {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    if (map.get(id)) |term| {
        term.deinit();
        std.heap.page_allocator.destroy(term);
        _ = map.remove(id);
    }
}

/// Feed data to a persistent terminal
fn feedTerminal(id: u32, data: []const u8) !void {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;
    try term.feed(data);
}

/// Resize a persistent terminal
fn resizeTerminal(id: u32, cols: u32, rows: u32) !void {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;
    try term.resize(@intCast(cols), @intCast(rows));
}

/// Reset a persistent terminal to initial state
fn resetTerminal(id: u32) !void {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;
    term.reset();
}

/// Get JSON output from a persistent terminal
fn getTerminalJson(id: u32, offset: u32, limit: u32) ![]const u8 {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;

    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.
    // This allows napigen to copy the returned slice to JS before memory is reused.

    const lim: ?usize = if (limit == 0) null else @intCast(limit);

    var output: std.ArrayListAligned(u8, null) = .empty;
    try writeJsonOutput(output.writer(alloc), &term.terminal, @intCast(offset), lim);

    return output.items;
}

/// Get plain text output from a persistent terminal
fn getTerminalText(id: u32) ![]const u8 {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;

    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.

    var builder: std.Io.Writer.Allocating = .init(alloc);
    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&term.terminal, .plain);
    try fmt.format(&builder.writer);

    return builder.writer.buffered();
}

/// Get cursor position from a persistent terminal as [x, y] JSON
fn getTerminalCursor(id: u32) ![]const u8 {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;

    const screen = term.terminal.screens.active;

    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.

    return std.fmt.allocPrint(alloc, "[{},{}]", .{ screen.cursor.x, screen.cursor.y });
}

/// Check if terminal is ready for reading (parser in ground state).
/// Returns true if all escape sequences have been fully processed.
fn isTerminalReady(id: u32) !bool {
    terminals_mutex.lock();
    defer terminals_mutex.unlock();

    const map = getTerminalsMap();
    const term = map.get(id) orelse return error.TerminalNotFound;

    return term.isReady();
}

/// Convert PTY input to JSON format
/// Returns JSON string with terminal data (cols, rows, cursor, lines with styled spans)
/// When limit is set, uses chunked parsing with early exit for better performance.
fn ptyToJson(input: []const u8, cols: u32, rows: u32, offset: u32, limit: u32) ![]const u8 {
    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.
    // This allows napigen to copy the returned slice to JS before memory is reused.

    const lim: ?usize = if (limit == 0) null else @intCast(limit);

    // Use unlimited scrollback so we don't lose content
    var t: ghostty_vt.Terminal = try ghostty_vt.Terminal.init(alloc, .{
        .cols = @intCast(cols),
        .rows = @intCast(rows),
        .max_scrollback = std.math.maxInt(usize),
    });
    defer t.deinit(alloc);

    // Enable linefeed mode so LF (\n) also performs carriage return (moves to column 0)
    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    // When limit is set, use chunked parsing with early exit
    // This allows us to stop parsing once we have enough lines
    if (lim) |line_limit| {
        const chunk_size: usize = 4096; // Process 4KB at a time
        const threshold = line_limit + offset + 20; // Extra buffer for safety
        var pos: usize = 0;

        while (pos < input.len) {
            const end = @min(pos + chunk_size, input.len);
            try stream.nextSlice(input[pos..end]);
            pos = end;

            // Check if we have enough lines and parser is in ground state
            // (not in the middle of an escape sequence)
            if (stream.parser.state == .ground) {
                if (hasEnoughLines(t.screens.active, threshold)) {
                    break; // Early exit!
                }
            }
        }
    } else {
        // No limit - parse everything
        try stream.nextSlice(input);
    }

    var output: std.ArrayListAligned(u8, null) = .empty;
    try writeJsonOutput(output.writer(alloc), &t, @intCast(offset), lim);

    return output.items;
}

/// Convert PTY input to plain text (strips ANSI escape codes)
fn ptyToText(input: []const u8, cols: u32, rows: u32) ![]const u8 {
    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.

    // Use unlimited scrollback so we don't lose content
    var t: ghostty_vt.Terminal = try ghostty_vt.Terminal.init(alloc, .{
        .cols = @intCast(cols),
        .rows = @intCast(rows),
        .max_scrollback = std.math.maxInt(usize),
    });
    defer t.deinit(alloc);

    // Enable linefeed mode so LF (\n) also performs carriage return (moves to column 0)
    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    try stream.nextSlice(input);

    // Use the ghostty formatter with plain format to get just the text
    var builder: std.Io.Writer.Allocating = .init(alloc);
    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&t, .plain);
    try fmt.format(&builder.writer);

    return builder.writer.buffered();
}

/// Convert PTY input to styled HTML
fn ptyToHtml(input: []const u8, cols: u32, rows: u32) ![]const u8 {
    const alloc = getArenaAllocator();
    // Note: arena is reset at the START of the next call, not here.

    // Use unlimited scrollback so we don't lose content
    var t: ghostty_vt.Terminal = try ghostty_vt.Terminal.init(alloc, .{
        .cols = @intCast(cols),
        .rows = @intCast(rows),
        .max_scrollback = std.math.maxInt(usize),
    });
    defer t.deinit(alloc);

    // Enable linefeed mode so LF (\n) also performs carriage return (moves to column 0)
    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    try stream.nextSlice(input);

    // Use the ghostty formatter with html format to get styled HTML
    var builder: std.Io.Writer.Allocating = .init(alloc);
    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&t, .html);
    try fmt.format(&builder.writer);

    return builder.writer.buffered();
}

// Define the NAPI module (only when not testing)
comptime {
    if (!builtin.is_test) {
        napigen.defineModule(initModule);
    }
}

fn initModule(js: *napigen.JsContext, exports: napigen.napi_value) anyerror!napigen.napi_value {
    // Stateless functions (create terminal each call)
    try js.setNamedProperty(exports, "ptyToJson", try js.createFunction(ptyToJson));
    try js.setNamedProperty(exports, "ptyToText", try js.createFunction(ptyToText));
    try js.setNamedProperty(exports, "ptyToHtml", try js.createFunction(ptyToHtml));

    // Persistent terminal management functions
    try js.setNamedProperty(exports, "createTerminal", try js.createFunction(createTerminal));
    try js.setNamedProperty(exports, "destroyTerminal", try js.createFunction(destroyTerminal));
    try js.setNamedProperty(exports, "feedTerminal", try js.createFunction(feedTerminal));
    try js.setNamedProperty(exports, "resizeTerminal", try js.createFunction(resizeTerminal));
    try js.setNamedProperty(exports, "resetTerminal", try js.createFunction(resetTerminal));
    try js.setNamedProperty(exports, "getTerminalJson", try js.createFunction(getTerminalJson));
    try js.setNamedProperty(exports, "getTerminalText", try js.createFunction(getTerminalText));
    try js.setNamedProperty(exports, "getTerminalCursor", try js.createFunction(getTerminalCursor));
    try js.setNamedProperty(exports, "isTerminalReady", try js.createFunction(isTerminalReady));

    return exports;
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

test "ptyToText strips ANSI and returns plain text" {
    const alloc = testing.allocator;

    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = 80, .rows = 24 });
    defer t.deinit(alloc);

    // Enable linefeed mode to match ptyToText behavior
    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    // Input with ANSI color codes: red "Hello" and green "World"
    try stream.nextSlice("\x1b[31mHello\x1b[0m \x1b[32mWorld\x1b[0m");

    var builder: std.Io.Writer.Allocating = .init(alloc);
    defer builder.deinit();

    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&t, .plain);
    try fmt.format(&builder.writer);

    const output = builder.writer.buffered();
    try testing.expectEqualStrings("Hello World", output);
}

test "ptyToText handles multiline with ANSI" {
    const alloc = testing.allocator;

    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = 80, .rows = 24 });
    defer t.deinit(alloc);

    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    // Input with ANSI codes across multiple lines
    try stream.nextSlice("\x1b[1mBold\x1b[0m\n\x1b[4mUnderline\x1b[0m");

    var builder: std.Io.Writer.Allocating = .init(alloc);
    defer builder.deinit();

    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&t, .plain);
    try fmt.format(&builder.writer);

    const output = builder.writer.buffered();
    try testing.expectEqualStrings("Bold\nUnderline", output);
}

test "ptyToHtml returns styled HTML" {
    const alloc = testing.allocator;

    var t: ghostty_vt.Terminal = try .init(alloc, .{ .cols = 80, .rows = 24 });
    defer t.deinit(alloc);

    t.modes.set(.linefeed, true);

    var stream = t.vtStream();
    defer stream.deinit();

    // Input with ANSI color codes: red "Hello"
    try stream.nextSlice("\x1b[31mHello\x1b[0m");

    var builder: std.Io.Writer.Allocating = .init(alloc);
    defer builder.deinit();

    var fmt: formatter.TerminalFormatter = formatter.TerminalFormatter.init(&t, .html);
    try fmt.format(&builder.writer);

    const output = builder.writer.buffered();
    // HTML output should contain style tags and the text
    try testing.expect(std.mem.indexOf(u8, output, "Hello") != null);
    try testing.expect(std.mem.indexOf(u8, output, "<") != null);
}

// =============================================================================
// Persistent Terminal Tests
// =============================================================================

test "PersistentTerminal init and deinit" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Verify terminal was created with correct dimensions
    try testing.expectEqual(@as(u16, 80), term.terminal.cols);
    try testing.expectEqual(@as(u16, 24), term.terminal.rows);
}

test "PersistentTerminal feed data" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Feed some data
    try term.feed("Hello World");

    // Verify cursor moved
    try testing.expectEqual(@as(usize, 11), term.terminal.screens.active.cursor.x);
}

test "PersistentTerminal feed multiple times" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Feed data in multiple chunks (simulating streaming)
    try term.feed("Hello ");
    try term.feed("World");
    try term.feed("\n");
    try term.feed("Line 2");

    // Verify cursor is on line 2
    try testing.expectEqual(@as(usize, 1), term.terminal.screens.active.cursor.y);
    try testing.expectEqual(@as(usize, 6), term.terminal.screens.active.cursor.x);
}

test "PersistentTerminal reset" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Feed some data
    try term.feed("Hello World\nLine 2\nLine 3");

    // Verify cursor moved
    try testing.expect(term.terminal.screens.active.cursor.y > 0);

    // Reset terminal
    term.reset();

    // Verify cursor is back at origin
    try testing.expectEqual(@as(usize, 0), term.terminal.screens.active.cursor.x);
    try testing.expectEqual(@as(usize, 0), term.terminal.screens.active.cursor.y);
}

test "PersistentTerminal resize" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Feed some data
    try term.feed("Hello World");

    // Resize to smaller terminal
    try term.resize(40, 10);

    // Verify new dimensions
    try testing.expectEqual(@as(u16, 40), term.terminal.cols);
    try testing.expectEqual(@as(u16, 10), term.terminal.rows);
}

test "PersistentTerminal preserves state across feeds" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Feed ANSI with color that sets state
    try term.feed("\x1b[32m"); // Set green color
    try term.feed("Green Text");
    try term.feed("\x1b[0m"); // Reset

    // Get output to verify
    var output: std.ArrayListAligned(u8, null) = .empty;
    defer output.deinit(alloc);

    try writeJsonOutput(output.writer(alloc), &term.terminal, 0, null);

    const json = output.items;
    try testing.expect(std.mem.indexOf(u8, json, "Green Text") != null);
}

test "PersistentTerminal handles cursor movement" {
    const alloc = testing.allocator;

    var term = try PersistentTerminal.init(alloc, 80, 24);
    term.initStream();
    defer term.deinit();

    // Move cursor to position 5,5
    try term.feed("\x1b[6;6H"); // CSI row;col H (1-indexed)

    // Verify cursor position (0-indexed)
    try testing.expectEqual(@as(usize, 5), term.terminal.screens.active.cursor.x);
    try testing.expectEqual(@as(usize, 5), term.terminal.screens.active.cursor.y);

    // Write some text
    try term.feed("X");

    // Cursor should have moved right
    try testing.expectEqual(@as(usize, 6), term.terminal.screens.active.cursor.x);
}
