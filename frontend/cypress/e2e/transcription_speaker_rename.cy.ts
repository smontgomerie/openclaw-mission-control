/// <reference types="cypress" />

import { setupCommonPageTestHooks } from "../support/testHooks";

describe("Transcript speaker rename", () => {
  const apiBase = "**/api/v1";

  setupCommonPageTestHooks(apiBase);

  it(
    "replaces a rejected candidate with the confirmed speaker without a page reload",
    { retries: 0 },
    () => {
      let renameCompleted = false;

      const entry = {
        id: "recording-1",
        title: "Recording with a new speaker",
        status: "done",
        is_done: true,
        captured_at: "2026-07-15T15:08:00-07:00",
        processed_at: "2026-07-15T15:15:00-07:00",
        source_files: [
          { name: "recording-1.m4a", relative_path: "recording-1.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        diarized_speaker_count: 1,
        diarized_speaker_preview: ["SPEAKER_00"],
      };

      const detail = {
        ...entry,
        transcript_text_content: "[SPEAKER_00] This is Steve speaking.",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              start: 12,
              end: 16,
              text: "This is Steve speaking.",
            },
          ],
        }),
      };

      const renamedDetail = {
        ...detail,
        transcript_text_content: "[Steve] This is Steve speaking.",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              speaker_name: "Steve",
              start: 12,
              end: 16,
              text: "This is Steve speaking.",
            },
          ],
        }),
      };

      cy.intercept("GET", `${apiBase}/transcriptions*`, {
        statusCode: 200,
        body: [entry],
      }).as("transcriptions");
      cy.intercept("GET", `${apiBase}/transcriptions/recording-1`, {
        statusCode: 200,
        body: detail,
      }).as("transcriptionDetail");
      cy.intercept("GET", `${apiBase}/transcriptions/speakers`, (request) => {
        request.reply({
          statusCode: 200,
          body: renameCompleted
            ? {
                profiles: [
                  {
                    id: "steve-profile",
                    display_name: "Steve",
                    aliases: [],
                    encoder: "ecapa",
                    confirmed_sample_count: 1,
                    represented_sample_count: 1,
                    pending_sample_count: 0,
                    created_at: "2026-07-15T00:00:00Z",
                    updated_at: "2026-07-15T00:00:00Z",
                  },
                ],
                pending_samples: [],
              }
            : {
                profiles: [
                  {
                    id: "monil-profile",
                    display_name: "Monil",
                    aliases: [],
                    encoder: "ecapa",
                    confirmed_sample_count: 3,
                    represented_sample_count: 3,
                    pending_sample_count: 1,
                    created_at: "2026-07-15T00:00:00Z",
                    updated_at: "2026-07-15T00:00:00Z",
                  },
                ],
                pending_samples: [
                  {
                    id: "pending-sample",
                    candidate_profile_id: "monil-profile",
                    candidate_name: "Monil",
                    transcription_entry_id: "recording-1",
                    speaker_label: "SPEAKER_00",
                    source_audio_path: "recording-1.m4a",
                    encoder: "ecapa",
                    speech_duration_seconds: 4,
                    segment_count: 1,
                    segment_evidence: [],
                    similarity: 0.29,
                    status: "pending",
                    source_type: "observation",
                    represented_sample_count: 1,
                    created_at: "2026-07-15T00:00:00Z",
                    updated_at: "2026-07-15T00:00:00Z",
                  },
                ],
              },
        });
      }).as("speakerDirectory");
      cy.intercept(
        "POST",
        `${apiBase}/transcriptions/recording-1/speakers/rename`,
        (request) => {
          expect(request.body).to.deep.equal({
            speaker_label: "SPEAKER_00",
            new_name: "Steve",
          });
          renameCompleted = true;
          request.reply({ statusCode: 200, body: renamedDetail });
        },
      ).as("renameSpeaker");

      cy.loginWithLocalAuth();
      cy.visit("/transcriptions");
      cy.waitForAppLoaded();
      cy.wait(["@transcriptions", "@transcriptionDetail"]);

      cy.contains("button", "SPEAKER_00").should("be.visible").click();
      cy.get('input[aria-label="Rename speaker SPEAKER_00"]')
        .should("be.visible")
        .type("{selectall}Steve{enter}");
      cy.wait("@renameSpeaker");

      cy.contains("button", "Steve").should("be.visible");
      cy.contains(/Review: Monil \(29%\)/).should("not.exist");
      cy.contains("Review queue")
        .parent()
        .contains("No speaker observations need review.")
        .should("be.visible");
    },
  );
});
