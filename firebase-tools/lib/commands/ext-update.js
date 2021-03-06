"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const clc = require("cli-color");
const _ = require("lodash");
const marked = require("marked");
const ora = require("ora");
const checkMinRequiredVersion_1 = require("../checkMinRequiredVersion");
const command_1 = require("../command");
const error_1 = require("../error");
const billingMigrationHelper_1 = require("../extensions/billingMigrationHelper");
const checkProjectBilling_1 = require("../extensions/checkProjectBilling");
const extensionsApi = require("../extensions/extensionsApi");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const paramHelper = require("../extensions/paramHelper");
const resolveSource = require("../extensions/resolveSource");
const updateHelper_1 = require("../extensions/updateHelper");
const getProjectId = require("../getProjectId");
const requirePermissions_1 = require("../requirePermissions");
const utils = require("../utils");
const TerminalRenderer = require("marked-terminal");
const previews_1 = require("../previews");
marked.setOptions({
    renderer: new TerminalRenderer(),
});
exports.default = new command_1.Command("ext:update <extensionInstanceId> [localDirectoryOrUrl]")
    .description(previews_1.previews.extdev
    ? "update an existing extension instance to the latest version or from a local or URL source"
    : "update an existing extension instance to the latest version")
    .before(requirePermissions_1.requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
])
    .before(extensionsHelper_1.ensureExtensionsApiEnabled)
    .before(checkMinRequiredVersion_1.checkMinRequiredVersion, "extMinVersion")
    .action((instanceId, directoryOrUrl, options) => __awaiter(void 0, void 0, void 0, function* () {
    const spinner = ora.default(`Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`);
    try {
        const projectId = getProjectId(options, false);
        let existingInstance;
        try {
            existingInstance = yield extensionsApi.getInstance(projectId, instanceId);
        }
        catch (err) {
            if (err.status === 404) {
                return utils.reject(`No extension instance ${instanceId} found in project ${projectId}.`, {
                    exit: 1,
                });
            }
            throw err;
        }
        const currentSpec = _.get(existingInstance, "config.source.spec");
        const currentParams = _.get(existingInstance, "config.params");
        const existingSource = _.get(existingInstance, "config.source.name");
        let source;
        let sourceName;
        if (previews_1.previews.extdev && directoryOrUrl) {
            try {
                source = yield extensionsHelper_1.createSourceFromLocation(projectId, directoryOrUrl);
                sourceName = source.name;
            }
            catch (err) {
                const invalidSourceErr = `Unable to update from the source \`${clc.bold(directoryOrUrl)}\`. To update this instance, you can either:\n
          - Run \`${clc.bold("firebase ext:update " + instanceId)}\` to update from the official source.\n
          - Check your directory path or URL, then run \`${clc.bold("firebase ext:update " + instanceId + " <localDirectoryOrUrl>")}\` to update from a local directory or URL source.`;
                throw new error_1.FirebaseError(invalidSourceErr);
            }
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `Updating ${instanceId} from version ${clc.bold(currentSpec.version)} to ${clc.bold(directoryOrUrl)} (${clc.bold(source.spec.version)})`);
            let msg1;
            let msg2;
            let msg3;
            if (extensionsHelper_1.urlRegex.test(directoryOrUrl)) {
                msg1 = "You are updating this extension instance from a URL source.";
                msg2 =
                    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the URL.";
                msg3 =
                    "After updating from a URL source, this instance cannot be updated in the future to use an official source.";
            }
            else {
                msg1 = "You are updating this extension instance from a local source.";
                msg2 =
                    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the local directory.";
                msg3 =
                    "After updating from a local source, this instance cannot be updated in the future to use an official source.";
            }
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold(msg1)}\n`);
            let updateWarning;
            let updatingFromOfficial = false;
            try {
                const registryEntry = yield resolveSource.resolveRegistryEntry(currentSpec.name);
                updatingFromOfficial = resolveSource.isOfficialSource(registryEntry, existingSource);
            }
            catch (_a) {
            }
            if (updatingFromOfficial) {
                updateWarning = {
                    from: "",
                    description: `${msg2}\n\n${msg3}`,
                };
            }
            else {
                updateWarning = {
                    from: "",
                    description: `${msg2}`,
                };
            }
            yield updateHelper_1.confirmUpdateWarning(updateWarning);
        }
        else {
            let registryEntry;
            try {
                registryEntry = yield resolveSource.resolveRegistryEntry(currentSpec.name);
            }
            catch (err) {
                throw new error_1.FirebaseError(`Unable to update this instance without a local or URL source. To update this instance, run "firebase ext:update ${instanceId} <localDirectoryOrUrl>".`);
            }
            const targetVersion = resolveSource.getTargetVersion(registryEntry, "latest");
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `Updating ${instanceId} from version ${clc.bold(currentSpec.version)} to version ${clc.bold(targetVersion)}`);
            const officialSourceMsg = "You are updating this extension instance from an official source.";
            utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold(officialSourceMsg)} \n\n All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the latest released version.\n`);
            yield resolveSource.promptForUpdateWarnings(registryEntry, currentSpec.version, targetVersion);
            sourceName = resolveSource.resolveSourceUrl(registryEntry, currentSpec.name, targetVersion);
        }
        const newSource = yield extensionsApi.getSource(sourceName);
        const newSpec = newSource.spec;
        if (!previews_1.previews.extdev || !directoryOrUrl) {
            if (currentSpec.version === newSpec.version) {
                utils.logLabeledBullet(extensionsHelper_1.logPrefix, `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(currentSpec.version)}.`);
                const retry = yield updateHelper_1.retryUpdate();
                if (!retry) {
                    utils.logLabeledBullet(extensionsHelper_1.logPrefix, "Update aborted.");
                    return;
                }
            }
        }
        yield updateHelper_1.displayChanges(currentSpec, newSpec);
        if (newSpec.billingRequired) {
            const enabled = yield checkProjectBilling_1.isBillingEnabled(projectId);
            if (!enabled) {
                yield billingMigrationHelper_1.displayNode10UpdateBillingNotice(currentSpec, newSpec, false);
                yield checkProjectBilling_1.enableBilling(projectId, instanceId);
            }
            else {
                yield billingMigrationHelper_1.displayNode10UpdateBillingNotice(currentSpec, newSpec, true);
            }
        }
        const newParams = yield paramHelper.promptForNewParams(currentSpec, newSpec, currentParams, projectId);
        spinner.start();
        const updateOptions = {
            projectId,
            instanceId,
            source: newSource,
        };
        if (!_.isEqual(newParams, currentParams)) {
            updateOptions.params = newParams;
        }
        yield updateHelper_1.update(updateOptions);
        spinner.stop();
        utils.logLabeledSuccess(extensionsHelper_1.logPrefix, `successfully updated ${clc.bold(instanceId)}.`);
        utils.logLabeledBullet(extensionsHelper_1.logPrefix, marked(`You can view your updated instance in the Firebase console: ${utils.consoleUrl(projectId, `/extensions/instances/${instanceId}?tab=usage`)}`));
    }
    catch (err) {
        if (spinner.isSpinning) {
            spinner.fail();
        }
        if (!(err instanceof error_1.FirebaseError)) {
            throw new error_1.FirebaseError(`Error occurred while updating the instance: ${err.message}`, {
                original: err,
            });
        }
        throw err;
    }
}));
