import { HTTPError } from "elysia";

export class InvalidImage extends HTTPError.id("INVALID_IMAGE", "Bad Request") {
  override readonly detail = "Image cannot be decoded";
}

export class UploadFailed extends HTTPError.id("UPLOAD_FAILED", "Bad Gateway") {
  override readonly detail = "Image upload failed";
}
