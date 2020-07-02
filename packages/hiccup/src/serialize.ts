import { deref, isDeref } from "@thi.ng/api";
import {
    implementsFunction,
    isArray,
    isFunction,
    isNotStringAndIterable,
    isPlainObject,
    isString,
} from "@thi.ng/checks";
import { illegalArgs } from "@thi.ng/errors";
import {
    ATTRIB_JOIN_DELIMS,
    COMMENT,
    NO_SPANS,
    PROC_TAGS,
    VOID_TAGS,
} from "./api";
import { css } from "./css";
import { escape } from "./escape";
import { normalize } from "./normalize";
import { formatPrefixes } from "./prefix";

/**
 * Recursively normalizes and serializes given tree as HTML/SVG/XML
 * string. Expands any embedded component functions with their results.
 *
 * @remarks
 * Each node of the input tree can have one of the following input
 * forms:
 *
 * ```js
 * ["tag", ...]
 * ["tag#id.class1.class2", ...]
 * ["tag", {other: "attrib"}, ...]
 * ["tag", {...}, "body", function, ...]
 * [function, arg1, arg2, ...]
 * [{render: (ctx,...) => [...]}, args...]
 * iterable
 * ```
 *
 * Tags can be defined in "Zencoding" convention, e.g.
 *
 * ```js
 * ["div#foo.bar.baz", "hi"] // <div id="foo" class="bar baz">hi</div>
 * ```
 *
 * The presence of the attributes object (2nd array index) is optional.
 * Any attribute values, incl. functions are allowed. If the latter, the
 * function is called with the full attribs object as argument and the
 * return value is used for the attribute. This allows for the dynamic
 * creation of attrib values based on other attribs. The only exception
 * to this are event attributes, i.e. attribute names starting with
 * "on". Function values assigned to event attributes will be omitted
 * from the output.
 *
 * ```js
 * ["div#foo", { bar: (attribs) => attribs.id + "-bar" }]
 * // <div id="foo" bar="foo-bar"></div>
 * ```
 *
 * The `style` attribute can ONLY be defined as string or object.
 *
 * ```js
 * ["div", {style: {color: "red", background: "#000"}}]
 * // <div style="color:red;background:#000;"></div>
 * ```
 *
 * Boolean attribs are serialized in HTML5 syntax (present or not).
 * `null`, `undefined` or empty string attrib values are ignored.
 *
 * Any `null` or `undefined` array values (other than in head position)
 * will also be removed, unless a function is in head position.
 *
 * A function in head position of a node acts as a mechanism for
 * component composition & delayed execution. The function will only be
 * executed at serialization time. In this case the optional global
 * context object and all other elements of that node / array are passed
 * as arguments when that function is called. The return value the
 * function MUST be a valid new tree (or `undefined`).
 *
 * If the `ctx` object it'll be passed to each embedded component fns.
 * Optionally call {@link derefContext} prior to {@link serialize} to
 * auto-deref context keys with values implementing the
 * {@link @thi.ng/api#IDeref} interface.
 *
 * ```js
 * const foo = (ctx, a, b) => ["div#" + a, ctx.foo, b];
 *
 * serialize([foo, "id", "body"], { foo: { class: "black" } })
 * // <div id="id" class="black">body</div>
 * ```
 *
 * Functions located in other positions are called ONLY with the global
 * context arg and can return any (serializable) value (i.e. new trees,
 * strings, numbers, iterables or any type with a suitable
 * `.toString()`, `.toHiccup()` or `.deref()` implementation).
 *
 * If the optional `span` flag is true (default: false), all text
 * content will be wrapped in <span> elements (this is to ensure DOM
 * compatibility with hdom). The only elements for spans are never
 * created are listed in `NO_SPANS` in `api.ts`.
 *
 * If the optional `keys` flag is true (default: false), all elements
 * will have an autogenerated `key` attribute injected. If `span` is
 * enabled, `keys` will be enabled by default too (since in this case we
 * assume the output is meant to be compatible with
 * {@link @thi.ng/hdom# | @thi.ng/hdom}).
 *
 * hiccup & hdom control attributes (i.e. attrib names prefixed with
 * `__`) will be omitted from the output. The only control attrib
 * supported by this package is `__serialize`. If set to `false`, the
 * entire tree branch will be excluded from the output.
 *
 * Single or multiline comments can be included using the special
 * `COMMENT` tag (`__COMMENT__`) (always WITHOUT attributes!).
 *
 * ```
 * [COMMENT, "Hello world"]
 * // <!-- Hello world -->
 *
 * [COMMENT, "Hello", "world"]
 * <!--
 *     Hello
 *     world
 * -->
 * ```
 *
 * Currently, the only processing / DTD instructions supported are:
 *
 * - `?xml`
 * - `!DOCTYTPE`
 * - `!ELEMENT`
 * - `!ENTITY`
 * - `!ATTLIST`
 *
 * These are used as follows (attribs are only allowed for `?xml`, all
 * others only accept a body string which is taken as is):
 *
 * ```
 * ["?xml", { version: "1.0", standalone: "yes" }]
 * // <?xml version="1.0" standalone="yes"?>
 *
 * ["!DOCTYPE", "html"]
 * // <!DOCTYPE html>
 * ```
 *
 * @param tree - hiccup elements / component tree
 * @param ctx - arbitrary user context object
 * @param escape - auto-escape entities
 * @param span - use spans for text content
 * @param keys - attach key attribs
 */
export const serialize = (
    tree: any,
    ctx?: any,
    escape = false,
    span = false,
    keys = span,
    path = [0]
) => _serialize(tree, ctx, escape, span, keys, path);

const _serialize = (
    tree: any,
    ctx: any,
    esc: boolean,
    span: boolean,
    keys: boolean,
    path: any[]
): string => {
    if (tree == null) {
        return "";
    }
    if (Array.isArray(tree)) {
        return serializeElement(tree, ctx, esc, span, keys, path);
    }
    if (isFunction(tree)) {
        return _serialize(tree(ctx), ctx, esc, span, keys, path);
    }
    if (implementsFunction(tree, "toHiccup")) {
        return _serialize(tree.toHiccup(ctx), ctx, esc, span, keys, path);
    }
    if (isDeref(tree)) {
        return _serialize(tree.deref(), ctx, esc, span, keys, path);
    }
    if (isNotStringAndIterable(tree)) {
        return serializeIter(tree, ctx, esc, span, keys, path);
    }
    tree = esc ? escape(tree.toString()) : tree;
    return span
        ? `<span${keys ? ` key="${path.join("-")}"` : ""}>${tree}</span>`
        : tree;
};

const serializeElement = (
    tree: any[],
    ctx: any,
    esc: boolean,
    span: boolean,
    keys: boolean,
    path: any[]
) => {
    if (!tree.length) {
        return "";
    }
    let tag = tree[0];
    if (isFunction(tag)) {
        return _serialize(
            tag.apply(null, [ctx, ...tree.slice(1)]),
            ctx,
            esc,
            span,
            keys,
            path
        );
    }
    if (implementsFunction(tag, "render")) {
        return _serialize(
            tag.render.apply(null, [ctx, ...tree.slice(1)]),
            ctx,
            esc,
            span,
            keys,
            path
        );
    }
    if (tag === COMMENT) {
        return serializeComment(tree);
    }
    if (isString(tag)) {
        tree = normalize(tree);
        tag = tree[0];
        const attribs = tree[1];
        if (attribs.__skip || attribs.__serialize === false) {
            return "";
        }
        let body = tree[2];
        let res = `<${tag}`;
        keys && attribs.key === undefined && (attribs.key = path.join("-"));
        res += serializeAttribs(attribs, esc);
        res += body
            ? serializeBody(tag, body, ctx, esc, span, keys, path)
            : !VOID_TAGS[tag]
            ? `></${tag}>`
            : PROC_TAGS[tag] || "/>";
        return res;
    }
    if (isNotStringAndIterable(tree)) {
        return serializeIter(tree, ctx, esc, span, keys, path);
    }
    return illegalArgs(`invalid tree node: ${tree}`);
};

const serializeAttribs = (attribs: any, esc: boolean) => {
    let res = "";
    for (let a in attribs) {
        if (a.startsWith("__")) continue;
        let v = deref(attribs[a]);
        if (v == null) continue;
        if (isFunction(v) && (/^on\w+/.test(a) || (v = v(attribs)) == null))
            continue;
        if (v === true) {
            res += " " + a;
            continue;
        } else if (v === false) {
            continue;
        }
        if (a === "data") {
            res += serializeDataAttribs(v, esc);
            continue;
        }
        if (a === "style" && isPlainObject(v)) {
            v = css(v);
        } else if (a === "prefix" && isPlainObject(v)) {
            v = formatPrefixes(v);
        } else {
            v = isArray(v)
                ? v.join(ATTRIB_JOIN_DELIMS[a] || " ")
                : v.toString();
        }
        v.length && (res += ` ${a}="${esc ? escape(v) : v}"`);
    }
    return res;
};

const serializeDataAttribs = (data: any, esc: boolean) => {
    let res = "";
    for (let id in data) {
        let v = deref(data[id]);
        isFunction(v) && (v = v(data));
        v != null && (res += ` data-${id}="${esc ? escape(v) : v}"`);
    }
    return res;
};

const serializeBody = (
    tag: string,
    body: any[],
    ctx: any,
    esc: boolean,
    span: boolean,
    keys: boolean,
    path: any[]
) => {
    if (VOID_TAGS[tag]) {
        illegalArgs(`No body allowed in tag: ${tag}`);
    }
    const proc = PROC_TAGS[tag];
    let res = proc ? " " : ">";
    span = span && !proc && !NO_SPANS[tag];
    for (let i = 0, n = body.length; i < n; i++) {
        res += _serialize(body[i], ctx, esc, span, keys, [...path, i]);
    }
    return res + (proc || `</${tag}>`);
};

const serializeComment = (tree: any[]) =>
    tree.length > 2
        ? `\n<!--\n${tree
              .slice(1)
              .map((x) => "    " + x)
              .join("\n")}\n-->\n`
        : `\n<!-- ${tree[1]} -->\n`;

const serializeIter = (
    iter: Iterable<any>,
    ctx: any,
    esc: boolean,
    span: boolean,
    keys: boolean,
    path: any[]
) => {
    const res = [];
    const p = path.slice(0, path.length - 1);
    let k = 0;
    for (let i of iter) {
        res.push(_serialize(i, ctx, esc, span, keys, [...p, k++]));
    }
    return res.join("");
};
