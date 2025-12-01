const std = @import("std");
const napigen = @import("napigen");

const LIB_NAME = "ghostty-opentui";

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Library module (with napigen for NAPI)
    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/lib.zig"),
        .target = target,
        .optimize = optimize,
        .strip = true, // Strip debug symbols for smaller binaries
        .single_threaded = true, // Remove threading overhead (not needed for PTY parsing)
    });

    if (b.lazyDependency("ghostty", .{
        .target = target,
        .optimize = optimize,
    })) |dep| {
        lib_mod.addImport("ghostty-vt", dep.module("ghostty-vt"));
    }

    // Add napigen import for library
    lib_mod.addImport("napigen", b.dependency("napigen", .{}).module("napigen"));

    const lib = b.addLibrary(.{
        .name = LIB_NAME,
        .root_module = lib_mod,
        .linkage = .dynamic,
    });

    // Setup napigen for NAPI
    napigen.setup(lib);

    b.installArtifact(lib);

    // Copy the result to a *.node file so we can require() it
    const copy_node_step = b.addInstallLibFile(lib.getEmittedBin(), LIB_NAME ++ ".node");
    b.getInstallStep().dependOn(&copy_node_step.step);

    // Test module (without napigen - tests don't need NAPI)
    const test_mod = b.createModule(.{
        .root_source_file = b.path("src/lib.zig"),
        .target = target,
        .optimize = optimize,
    });

    if (b.lazyDependency("ghostty", .{
        .target = target,
        .optimize = optimize,
    })) |dep| {
        test_mod.addImport("ghostty-vt", dep.module("ghostty-vt"));
    }

    const test_step = b.step("test", "Run unit tests");
    const test_exe = b.addTest(.{
        .root_module = test_mod,
    });
    const run_test = b.addRunArtifact(test_exe);
    test_step.dependOn(&run_test.step);
}
