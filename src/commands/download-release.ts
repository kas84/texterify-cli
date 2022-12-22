import AdmZip from "adm-zip";
import fs from "fs";
import Listr from "listr";
import * as path from "path";
import { ProjectsAPI } from "../api/ProjectsAPI";
import { Logger } from "../Logger";
import { Settings } from "../Settings";
import { Validators } from "../Validators";
import { showErrorFixSuggestions } from "../Suggestions";
import { projectConfig } from "../Config";
import * as nconf from "nconf";
import { ErrorUtils } from "../api/ErrorUtils";
import { Command, Flags } from "@oclif/core";
import { auth_email_flag } from "../flags/auth_email_flag";
import { auth_secret_flag } from "../flags/auth_secret_flag";
import { help_flag } from "../flags/help_flag";

export default class Download extends Command {
    static description = "download the release translations";

    static flags = {
        help: help_flag,
        "project-path": Flags.string(),
        emojify: Flags.boolean(),
        "auth-email": auth_email_flag,
        "auth-secret": auth_secret_flag
    };

    static args = [];
    static locales = ["es-ES", "en-US", "fr-FR", "it-IT", "nl-NL", "pt-PT", "es-MX"];
    static examples = ["$ texterify download"];

    async run() {
        const { flags } = await this.parse(Download);
        Settings.setAuthCredentialsPassedViaCLI({
            email: flags["auth-email"],
            secret: flags["auth-secret"]
        });

        if (flags["project-path"]) {
            const configFilePath = path.join(flags["project-path"], "texterify.json");
            const newProjectStore = new nconf.Provider();
            newProjectStore.file({ file: configFilePath });
            projectConfig.setStore(newProjectStore);
            projectConfig.setKey("project_path", flags["project-path"]);
        }

        const projectId = Settings.getProjectID();
        Validators.ensureProjectId(projectId);

        const exportConfigId = Settings.getExportConfigID();
        Validators.ensureExportConfigId(exportConfigId);
        const taskArray = [];
        for (const locale of Download.locales) {
            taskArray.push({
                title: `Downloading ${locale} translations...`,
                task: async (ctx: any) => {
                    try {
                        let response: any = await ProjectsAPI.exportRelease(projectId, exportConfigId, {
                            emojify: flags.emojify,
                            locale
                        });

                        if (response.status !== 200) {
                            response = await response.json();
                            if (response?.error) {
                                ErrorUtils.getAndPrintErrors(response);
                                throw new Error();
                            }

                            Logger.error("Failed to download translations.");

                            throw new Error();
                        } else {
                            ctx.exportResponse = response;
                            const jsonName = path.join(Settings.getProjectPath(), `${locale}.json`);
                            const dest = fs.createWriteStream(jsonName);
                            ctx.exportResponse.body.pipe(dest);
                        }
                    } catch (error) {
                        Logger.error("Failed to download translations.");
                        showErrorFixSuggestions(error);
                        throw new Error();
                    }
                }
            });
        }
        const tasks = new Listr(taskArray);

        try {
            await tasks.run();
            Logger.success("\nSuccessfully downloaded and extracted translations.");
        } catch (error) {
            Logger.error("Failed to download and extract translations.");
            showErrorFixSuggestions(error);
            Validators.exitWithError(this);
        }
    }
}
