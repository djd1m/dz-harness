interface CatalogPackage {
    readonly name: string;
    readonly version: string;
    /** Portable physical reference in normalized evidence; absolute root during scanning. */
    readonly dir: string;
    readonly artifact?: string;
    readonly private?: boolean;
    readonly members?: readonly string[];
    readonly occurrences?: readonly {
        readonly id: string;
        readonly layout: string;
        readonly path: string;
    }[];
}
/**
 * Packages and ordered carrier references are explicit. Repeated physical copies retain their
 * diagnostic paths, while identical package/version/artifact identities count once. Supplying
 * normalized occurrences selects the same process-free aggregation used by captured evidence.
 */
export declare function buildScopedCatalogInventory(input: {
    readonly cwd: string;
    readonly packages: readonly CatalogPackage[];
    readonly carriers: readonly {
        readonly dir: string;
        readonly pack?: string;
    }[];
}): {
    packages: {
        name: string;
        version: string;
        artifact: string | null;
        dir: string;
        private: boolean;
        occurrences: {
            id: string;
            layout: string;
            path: string;
        }[];
        ids: string[];
        layouts: string[];
    }[];
    carriers: {
        dir: string;
        pack: string;
    }[];
    rows: {
        pack: string;
        skills: number;
        name: string;
        version: string;
        artifact: string | null;
        dir: string;
        private: boolean;
        occurrences: {
            id: string;
            layout: string;
            path: string;
        }[];
        ids: string[];
        layouts: string[];
    }[];
    registry: import("./registry.js").Registry;
    totalPackages: number;
    totalCarriers: number;
    totalSkills: number;
    categories: readonly string[];
    membershipDigest: string;
};
export {};
//# sourceMappingURL=scoped-catalog-inventory.d.ts.map