/**
 * Global type declarations for SAP CAP CDS framework
 *
 * This file augments the global namespace with the CDS runtime object.
 * The actual CDS type is complex and changes between versions, so we only
 * type the properties we actually use to avoid tight coupling.
 */

declare global {
  /**
   * Global CDS instance provided by @sap/cds framework.
   * Available at runtime when the CAP application is initialized.
   *
   * Note: We use `any` for the global.cds object itself because the actual
   * type from @sap/cds is complex and version-dependent. This is an acceptable
   * use of `any` for a global runtime object that's out of our control.
   */
  var cds: any;
}

export {};
