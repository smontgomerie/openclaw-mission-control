import { defineConfig } from "orval";
export default defineConfig({
    missionControl: {
        input: {
            target: "../../backend/openapi.json",
        },
        output: {
            target: "src/generated/client.ts",
            schemas: "src/generated/model",
            client: "fetch",
            mode: "single",
            prettier: true,
            override: {
                title: (title) => title.replace(/^OpenClaw Mission Control/i, "MissionControl"),
            },
        },
    },
});
