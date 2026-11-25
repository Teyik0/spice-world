import { setFileTypeDetector } from "elysia";
import { fileTypeFromBlob } from "file-type";

setFileTypeDetector(fileTypeFromBlob);

Bun.env.STRIPE_SECRET_KEY = "sk_test_dummy";
Bun.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
