import config from "./open-next.config";

// The preview build supplies the Worker, live-data and noindex environment explicitly.
export default { ...config, buildCommand: "npm run build" };
