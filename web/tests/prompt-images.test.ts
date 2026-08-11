import assert from "node:assert/strict";

import { extractPromptImages } from "../src/services/api/prompts";

const markup = [
    "![Markdown](./a.png)",
    '<img alt="HTML" src="./b.png" />',
    "![](https://cdn.example.com/c.png)",
    "<img src='./a.png'>",
].join("\n");

assert.deepEqual(extractPromptImages("https://raw.example.com/repo", markup), [
    "https://raw.example.com/repo/a.png",
    "https://raw.example.com/repo/b.png",
    "https://cdn.example.com/c.png",
]);

console.log("prompt image parsing tests passed");
