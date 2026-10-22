import { getSql } from "../db";
import { getDealsConfig } from "../deals/config";
import { getCurrentUser } from "../session";
import { findVisibleImage, loadImageBytes, pgUploadDeps } from "./store";
import { handleImageGet, handleImageUpload } from "./upload-handler";
import { uploadImageFlow } from "./upload-image";

/** The real wiring of the image routes (routes/api/deal-images). */
export const uploadImageRoute = (request: Request) =>
  handleImageUpload(request, {
    getUserId: async () => (await getCurrentUser())?.id ?? null,
    upload: (userId, bytes) => uploadImageFlow(pgUploadDeps(getSql(), userId), userId, bytes),
  });

export const getImageRoute = (id: string, request: Request) =>
  handleImageGet(id, request, {
    findVisible: (imageId) => findVisibleImage(getSql(), imageId, new Date(), getDealsConfig().hideScore),
    loadBytes: (imageId) => loadImageBytes(getSql(), imageId),
  });
