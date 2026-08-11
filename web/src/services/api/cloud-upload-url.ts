export function directStorageUploadEndpoint(projectUrl: string) {
    const url = new URL(projectUrl);
    if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
        url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
    }
    return `${url.origin}/storage/v1/upload/resumable`;
}
