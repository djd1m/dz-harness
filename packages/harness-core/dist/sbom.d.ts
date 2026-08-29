export interface SbomPackage {
    readonly SPDXID: string;
    readonly name: string;
    readonly versionInfo: string;
    readonly downloadLocation: string;
    readonly licenseConcluded: string;
    readonly licenseDeclared: string;
    readonly externalRefs: readonly {
        referenceCategory: string;
        referenceType: string;
        referenceLocator: string;
    }[];
}
export interface SpdxDocument {
    readonly spdxVersion: 'SPDX-2.3';
    readonly dataLicense: 'CC0-1.0';
    readonly SPDXID: 'SPDXRef-DOCUMENT';
    readonly name: string;
    readonly documentNamespace: string;
    readonly creationInfo: {
        readonly created: string;
        readonly creators: readonly string[];
    };
    readonly packages: readonly SbomPackage[];
    readonly relationships: readonly {
        spdxElementId: string;
        relationshipType: string;
        relatedSpdxElement: string;
    }[];
}
/** Build an SPDX-2.3 SBOM document. Pure + deterministic (injected `created`; packages sorted by name+version). */
export declare function buildSbom(input: {
    name: string;
    lock?: unknown;
    pkg?: unknown;
    includeDev?: boolean;
    created: string;
    namespace?: string;
}): SpdxDocument;
/** Shape check for `--validate-only`: returns the problems (empty ⇒ valid SPDX-2.3 skeleton). */
export declare function validateSbom(doc: unknown): string[];
//# sourceMappingURL=sbom.d.ts.map