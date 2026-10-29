import { setFileTypeDetector } from "elysia";
import { fileTypeFromBlob } from "file-type";

setFileTypeDetector(fileTypeFromBlob);
