import { describe, expect, it } from "vitest";

import {
  ImageError,
  MAX_IMAGE_BYTES_CLIENT,
  randomImageId,
  readImageFile,
} from "@/lib/composer-images";

// `readImageFile`'s happy path needs Image / canvas / FileReader and is
// dogfood-verified, not unit-tested under the `node` test environment.
// Its two validation gates reject *before* touching the DOM, so a plain
// `{ type, size }` shaped like a File exercises them here.
const fakeFile = (type: string, size: number) =>
  ({ type, size }) as unknown as File;

describe("readImageFile validation gates", () => {
  it("rejects an unsupported mime type with reason 'unsupported'", async () => {
    await expect(readImageFile(fakeFile("image/gif", 100))).rejects.toMatchObject(
      { reason: "unsupported" } satisfies Partial<ImageError>,
    );
  });

  it("rejects an oversized image with reason 'too-large'", async () => {
    await expect(
      readImageFile(fakeFile("image/png", MAX_IMAGE_BYTES_CLIENT + 1)),
    ).rejects.toMatchObject({ reason: "too-large" } satisfies Partial<ImageError>);
  });

  it("rejection is an ImageError (instanceof + name), not a bare Error", async () => {
    const err = await readImageFile(fakeFile("image/heic", 1)).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.name).toBe("ImageError");
  });
});

describe("randomImageId", () => {
  it("prefixes ids with 'img-'", () => {
    expect(randomImageId()).toMatch(/^img-/);
  });

  it("returns distinct ids across calls", () => {
    const ids = new Set(Array.from({ length: 64 }, () => randomImageId()));
    expect(ids.size).toBe(64);
  });
});

describe("MAX_IMAGE_BYTES_CLIENT", () => {
  it("stays locked to the 10 MB Rust Core cap (core/src/commands/session.rs)", () => {
    expect(MAX_IMAGE_BYTES_CLIENT).toBe(10 * 1024 * 1024);
  });
});
