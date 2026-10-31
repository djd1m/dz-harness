/** Parse one complete `go test -json` process observation; an incomplete stream never proves a test. */
export function classifyGoTestExecutionEvidence(output, exitCode, identity, captureComplete) {
    const unknown = (detail) => ({
        exitCode, runner: 'unrecognised', failureKind: 'unrecognised', testsExecuted: null,
        testsRun: null, targetSeen: false, evidenceLine: detail,
    });
    if (!captureComplete || exitCode === null || typeof output !== 'string' || !output.endsWith('\n'))
        return unknown('incomplete Go JSON capture');
    if (!identity.packagePath || !/^Test[A-Z0-9][A-Za-z0-9_]*$/.test(identity.testName))
        return unknown('invalid Go identity');
    const actions = new Map();
    const paused = new Set();
    let packageStarts = 0;
    let packageTerminal = null;
    let targetRuns = 0;
    for (const line of output.slice(0, -1).split('\n')) {
        if (!line)
            return unknown('empty Go JSON event');
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            return unknown('malformed Go JSON event');
        }
        if (event === null || typeof event !== 'object')
            return unknown('invalid Go JSON event');
        const e = event;
        if (e.Package !== identity.packagePath || typeof e.Action !== 'string' || typeof e.Time !== 'string')
            return unknown('wrong Go package or malformed event');
        if (!['start', 'run', 'output', 'pass', 'fail', 'skip', 'pause', 'cont'].includes(e.Action))
            return unknown('unknown Go action');
        if (e.Action === 'output' && typeof e.Output !== 'string')
            return unknown('malformed Go output event');
        if (packageTerminal !== null)
            return unknown('events after package terminal');
        if (e.Test === undefined) {
            if (e.Action === 'start') {
                if (++packageStarts !== 1)
                    return unknown('duplicate package start');
            }
            else if (e.Action === 'pass' || e.Action === 'fail') {
                if (packageStarts !== 1)
                    return unknown('package terminal before start');
                packageTerminal = e.Action;
            }
            else if (e.Action !== 'output' || packageStarts !== 1)
                return unknown('invalid package event');
            continue;
        }
        if (packageStarts !== 1 || typeof e.Test !== 'string')
            return unknown('test before package start');
        const name = e.Test;
        if (name !== identity.testName && !name.startsWith(identity.testName + '/'))
            return unknown('wrong Go test identity');
        if (name !== identity.testName && actions.get(identity.testName) !== 'run')
            return unknown('subtest outside active parent');
        if (e.Action === 'run') {
            if (actions.has(name))
                return unknown('duplicate Go test run');
            actions.set(name, 'run');
            if (name === identity.testName && ++targetRuns !== 1)
                return unknown('ambiguous Go test identity');
        }
        else if (e.Action === 'pass' || e.Action === 'fail' || e.Action === 'skip') {
            if (actions.get(name) !== 'run' || paused.has(name))
                return unknown('missing run or duplicate terminal');
            actions.set(name, e.Action);
        }
        else if (e.Action === 'pause') {
            if (actions.get(name) !== 'run' || paused.has(name))
                return unknown('invalid Go pause');
            paused.add(name);
        }
        else if (e.Action === 'cont') {
            if (!paused.delete(name))
                return unknown('invalid Go continuation');
        }
        else if (e.Action === 'output' && !actions.has(name))
            return unknown('Go test output before run');
        else if (e.Action === 'start')
            return unknown('invalid test start');
    }
    const parent = actions.get(identity.testName);
    if (packageStarts !== 1 || targetRuns !== 1 || (parent !== 'pass' && parent !== 'fail') || packageTerminal === null)
        return unknown('missing completed named test or package');
    if ([...actions.values()].some(value => value === 'run'))
        return unknown('incomplete Go subtest');
    if (parent === 'pass' && [...actions.values()].some(value => value === 'fail'))
        return unknown('failed Go descendant contradicts passing named test');
    if ((exitCode === 0 && (parent !== 'pass' || packageTerminal !== 'pass'))
        || (exitCode !== 0 && (parent !== 'fail' || packageTerminal !== 'fail')))
        return unknown('Go exit and terminal conflict');
    const testsRun = [...actions.values()].filter(value => value === 'pass' || value === 'fail').length;
    return {
        exitCode, runner: 'go-test', failureKind: exitCode === 0 ? 'none' : 'assertions',
        testsExecuted: testsRun, testsRun, targetSeen: true,
        evidenceLine: `${identity.packagePath} ${identity.testName}: ${parent}; completed tests: ${testsRun}`,
    };
}
//# sourceMappingURL=go-discrimination-evidence.js.map