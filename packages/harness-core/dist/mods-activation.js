const unknown = (reasonCode) => ({ state: 'unknown', reasonCode });
const noUiHost = new Set(['print', 'sdk', 'cloud', 'desktop-wsl']);
function mapFact(fact) {
    return {
        state: fact.state === 'observed_yes' ? 'reported_yes'
            : fact.state === 'observed_no' ? 'reported_no' : fact.state,
        reasonCode: fact.reasonCode,
    };
}
/**
 * Never promotes an input report to a verified claim. Identity mismatch invalidates
 * every runtime stage; a headless target makes UI not applicable by host kind.
 */
export function projectModActivation(intent, observation) {
    const uiUnavailable = noUiHost.has(intent.host.kind);
    const defaultUi = uiUnavailable
        ? { state: 'not_applicable', reasonCode: 'host-has-no-ui' }
        : unknown('not-probed');
    const base = {
        pluginId: intent.plugin.id,
        hostKind: intent.host.kind,
        evidenceVerification: 'not-performed',
    };
    if (!observation) {
        return {
            ...base, identity: 'intent-only',
            installed: unknown('not-probed'), apiAvailable: unknown('not-probed'),
            handlerExecuted: unknown('not-probed'), uiDisplayed: defaultUi,
        };
    }
    const matches = observation.pluginId === intent.plugin.id
        && observation.host.kind === intent.host.kind
        && (intent.plugin.sha256 === null || observation.pluginSha256 === intent.plugin.sha256)
        && (intent.host.version === null || observation.host.version === intent.host.version)
        && (intent.host.buildId === null || observation.host.buildId === intent.host.buildId);
    if (!matches) {
        return {
            ...base, identity: 'mismatched',
            installed: unknown('identity-mismatch'), apiAvailable: unknown('identity-mismatch'),
            handlerExecuted: unknown('identity-mismatch'), uiDisplayed: uiUnavailable ? defaultUi : unknown('identity-mismatch'),
        };
    }
    const apiAvailable = mapFact(observation.facts.apiAvailable);
    const uiDisplayed = uiUnavailable ? defaultUi : mapFact(observation.facts.uiDisplayed);
    const hasDeclaredApi = intent.handlers.some((handler) => handler.apiCalls.length > 0);
    const hasDeclaredUi = intent.renderSites.length > 0;
    const installed = mapFact(observation.facts.installed);
    const stageAfterMissingInstallation = (stage) => installed.state === 'reported_no' && stage.state === 'reported_yes'
        ? unknown('installation-conflict') : stage;
    return {
        ...base, identity: 'matched',
        installed,
        apiAvailable: stageAfterMissingInstallation(!hasDeclaredApi && apiAvailable.state === 'reported_yes'
            ? unknown('api-not-declared') : apiAvailable),
        handlerExecuted: stageAfterMissingInstallation(mapFact(observation.facts.handlerExecuted)),
        uiDisplayed: stageAfterMissingInstallation(!hasDeclaredUi && uiDisplayed.state === 'reported_yes'
            ? unknown('ui-not-declared') : uiDisplayed),
    };
}
//# sourceMappingURL=mods-activation.js.map