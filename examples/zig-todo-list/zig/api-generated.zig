//! Generated by @thi.ng/wasm-api at 2022-11-22T23:00:11.903Z - DO NOT EDIT!

const std = @import("std");
const wasm = @import("wasmapi");

pub const Task = extern struct {
    state: TaskState = .open,
    body: wasm.ConstStringPtr,
    dateCreated: u32,
    dateDone: u32 = 0,
};

pub const TaskState = enum(i32) {
    open,
    done,
};
