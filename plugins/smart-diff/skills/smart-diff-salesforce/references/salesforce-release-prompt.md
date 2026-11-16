## Salesforce DX release rules

This repository is a Salesforce DX project. The diff is limited to the
project's package directories (from `sfdx-project.json`), plus any manifest
folder the user chose to include. Readers are the release manager, admins,
and developers preparing a Salesforce deployment. Write for that audience.

### Reading the paths

Identify each changed file's metadata type from its path and suffix in
source format, for example:

- `classes/*.cls` Apex class, `triggers/*.trigger` Apex trigger
- `lwc/<name>/` Lightning Web Component, `aura/<name>/` Aura component
- `flows/*.flow-meta.xml` Flow
- `objects/<Object>/fields/*.field-meta.xml` custom field,
  `objects/<Object>/validationRules/`, `recordTypes/`, `listViews/`,
  `objects/<Object>/<Object>.object-meta.xml` object settings
- `permissionsets/`, `permissionsetgroups/`, `profiles/`, `sharingRules/`,
  `roles/`, `queues/`, `groups/`
- `layouts/`, `flexipages/`, `tabs/`, `applications/`
- `customMetadata/`, `labels/`, `staticresources/`, `namedCredentials/`,
  `externalCredentials/`, `remoteSiteSettings/`, `connectedApps/`,
  `cspTrustedSites/`, `settings/`
- `destructiveChanges*.xml` and `package.xml` in a manifest folder

A `-meta.xml` file and its source file (for example `Foo.cls` and
`Foo.cls-meta.xml`) are one component. Report them once. A change only to
`apiVersion` in a `-meta.xml` file is an API version bump.

A deleted file under a package directory means the component is removed from
source. It is not deleted from the org unless a destructive changes manifest
or the deployment tool handles it. Say so.

### When summarizing one batch

Tag each bullet with the metadata type and API name, for example
`[ApexClass] AccountService: ...`. Flag deletions, renames, and anything
listed under "Release risks" below.

### Final summary format

Use the Team line, if given, in the title: `## <Team> – Salesforce release summary`.
Otherwise use `## Salesforce release summary`. Then use these sections, and
omit any that are empty:

1. **Highlights**: 3 to 6 bullets on what this release does for users and
   admins, in business terms.
2. **Changes by metadata type**: group by type (Apex, Triggers, LWC/Aura,
   Flows, Objects & Fields, Security & Access, UI, Configuration &
   Integrations, Other). Name components by API name. Do not list every file.
3. **Destructive changes**: removed or renamed components, removed fields,
   and the contents of any `destructiveChanges*.xml`. Note whether a
   destructive manifest covers each removal, if that is visible.
4. **Security & access**: profile, permission set, permission set group,
   sharing rule, field-level security, Apex `with/without sharing`, and
   connected app or credential changes.
5. **Release risks**: list each one that applies, and tie it to the diff:
   - Apex or trigger changes that need test classes. Note changed classes
     with no matching test class change in the diff.
   - Flow changes that activate, deactivate, or change entry criteria or
     trigger order, and new record-triggered automation on busy objects.
   - Field type changes, required-field changes, new validation rules, and
     picklist value removals that can break data loads or integrations.
   - Changes to named credentials, remote sites, CSP, or endpoints that need
     per-environment values.
   - API version changes.
   - Anything that cannot be deployed with the Metadata API and needs a
     manual step.
6. **Deployment notes**: dependency order (for example objects and fields
   before code, permission sets after the fields they grant), components
   that need manual or pre/post-deployment steps, data loads, and suggested
   Apex test classes to run if they are visible in the diff.
7. **Testing focus**: what QA or UAT should check.

Base every claim on the visible diff. If a risk depends on org state you
cannot see (for example existing data or other automation), say what to
check instead of guessing.
