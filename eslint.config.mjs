import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Layer boundaries and the hard bans, per docs/architecture/01-stack-and-structure.md §2.2.
 * Every rule below exists because of a specific, named defect. Do not relax one without
 * reading why it is there.
 */
const eslintConfig = defineConfig([
  // src/generated/** is Prisma's output: gitignored, and must not be linted or
  // typechecked as if we wrote it (01 §5.9, P01 exit criterion (d)).
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "src/generated/**",
    "tests/lint/boundaries.fixture/**",
    "next-env.d.ts",
  ]),

  ...nextVitals,
  ...nextTs,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*.{ts,tsx}", "middleware.ts"],
      "boundaries/elements": [
        // Order matters: the FIRST match wins, so narrower globs come first.
        { type: "config", pattern: "src/lib/config/**" },
        { type: "types", pattern: "src/types/**" },
        { type: "data", pattern: "src/lib/db/**" },
        // 15 §1.1: `src/lib/rules/` imports NOTHING from a domain module. That is what stops
        // the shared rule language becoming a second service layer — the moment it can reach
        // `src/lib/catalog`, the resolver seam stops being a seam.
        { type: "lib-shared", pattern: "src/lib/rules/**" },
        { type: "middleware", pattern: "src/lib/edge/**" },
        { type: "reporting", pattern: "src/lib/reporting/**" },
        { type: "service", pattern: "src/lib/*/**" },
        { type: "actions", pattern: "src/server/actions/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "app", pattern: "src/app/**" },
      ],
    },
    rules: {
      "boundaries/no-unknown": "off",
      "boundaries/no-unknown-files": "off",
      "boundaries/dependencies": [
        "error",
        {
          // Deny by default. Everything permitted is listed explicitly.
          default: "disallow",
          policies: [
            { from: [{ element: { type: "app" } }],
              allow: [{ to: { element: { type: ["actions", "service", "components", "types", "config", "reporting"] } } }] },
            { from: [{ element: { type: "actions" } }],
              allow: [{ to: { element: { type: ["service", "types", "config"] } } }] },
            { from: [{ element: { type: "service" } }],
              allow: [
                { to: { element: { type: ["service", "data", "types", "config"] } } },
                // A service may USE the shared rule language; the shared layer may not
                // reach back. One direction only is what keeps the dependency a seam.
                { to: { element: { type: "lib-shared" } } },
              ] },
            // Reporting is read-only and admin-only: it may read the data layer and other
            // services, but nothing may import IT except src/app/(admin)/** (01 §2.2).
            { from: [{ element: { type: "reporting" } }],
              allow: [{ to: { element: { type: ["data", "types", "config", "service"] } } }] },
            { from: [{ element: { type: "data" } }],
              allow: [{ to: { element: { type: ["types", "config"] } } }] },
            // Components receive data as PROPS. A service may be imported only for its
            // types — `import type` — never for a value.
            { from: [{ element: { type: "components" } }],
              allow: [{ to: { element: { type: ["components", "types", "config"] } } }] },
            { from: [{ element: { type: "components" } }],
              allow: [{ to: { element: { type: "service" } }, importKind: "type" }] },
            // The edge runtime: no Prisma, no service, no fetch to our own origin. Its
            // only market source is the generated snapshot (01 §1.4).
            { from: [{ element: { type: "middleware" } }],
              allow: [{ to: { element: { type: ["config", "types"] } } }] },
            // The shared rule language (15 §1.1). It may reach the SQL tag, because its whole
            // output is a SQL fragment — and NOTHING else. Not a service, not a domain module,
            // not the Prisma client. The moment it can import `src/lib/catalog`, the field
            // resolver stops being a seam and this becomes a second service layer with two
            // callers, which is precisely the shape 15 §1.1 was written to avoid.
            { from: [{ element: { type: "lib-shared" } }],
              allow: [{ to: { element: { type: ["data", "types", "config"] } } }] },
            { from: [{ element: { type: "config" } }],
              allow: [{ to: { element: { type: "types" } } }] },
            { from: [{ element: { type: "types" } }],
              allow: [{ to: { element: { type: "types" } } }] },
          ],
        },
      ],

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Only src/lib/db/** may import the Prisma client. Pages, components and " +
                "services go through the data layer. (01 §2.2)",
            },
          ],
          patterns: [
            {
              group: ["@/generated/prisma", "@/generated/prisma/**", "**/generated/prisma"],
              message:
                "The client is generated to src/generated/prisma, so banning only the " +
                "'@prisma/client' spelling bans nothing. Import from src/lib/db/**. (01 §2.2)",
            },
          ],
        },
      ],

      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read configuration through src/lib/config/env.ts, which validates it at boot. " +
            "A bare process.env read is an unvalidated, possibly-undefined secret. (01 §2.2)",
        },
        {
          object: "Intl",
          property: "NumberFormat",
          message:
            "Format money through src/lib/money.ts. Intl.NumberFormat('en-US',{currency:'INR'}) " +
            "renders a lakh as ₹100,000.00 instead of ₹1,00,000.00. (01 §2.6)",
        },
      ],

      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression > MemberExpression[property.name='toFixed']",
          message:
            ".toFixed() on an amount is a float formatting a price. Money is integer minor " +
            "units; format it through src/lib/money.ts. (01 §2.2)",
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            "parseFloat on an amount reintroduces float money. Use BigInt over minor units. (01 §2.2)",
        },
        {
          selector:
            "Property[key.name='isolationLevel'][value.value='Serializable']",
          message:
            "Declare Serializable only in src/lib/db/transaction.ts, which retries SQLSTATE " +
            "40001. Inline, a serialization failure reaches the customer as a 500. (01 §1.2)",
        },
      ],
    },
  },

  // 09 P14 criterion (a): every palette value is a CSS custom property, ZERO hex literals in
  // components. A hex in a component is a colour outside the token table — so it is outside
  // the contrast test, outside the surface system, and invisible to every check that exists.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "A hex colour in a component is a colour outside src/styles/tokens.css — outside " +
            "the contrast test, outside the surface system, and invisible to every check we " +
            "have. Use a --md-* token. (10 §2.1)",
        },
        {
          selector:
            "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b/]",
          message: "A hex colour in a template literal is still a hex colour. (10 §2.1)",
        },
      ],
    },
  },

  // The exemptions. Each names the single module allowed to do the banned thing.
  {
    files: ["src/lib/money.ts"],
    rules: { "no-restricted-properties": "off", "no-restricted-syntax": "off" },
  },
  {
    files: ["src/lib/config/env.ts", "scripts/**", "*.config.{ts,mjs,js}", "prisma7.config.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    files: ["src/lib/db/**", "prisma/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/lib/db/transaction.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // `new Date()` is banned ONLY inside pricing, stated positively.
  //
  // It was previously expressed as "everything EXCEPT pricing gets the other three
  // rules", which meant the base block carried the Date ban and applied it to scripts,
  // seeds and tests — where `new Date()` is ordinary. An inverted rule is also the shape
  // that silently re-enabled the money.ts exemption in P01. State the narrow thing.
  {
    files: ["src/lib/pricing/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "new Date() inside pricing makes a price differ between two calls a millisecond " +
            "apart during one checkout. `at` is always passed in. (01 §2.2)",
        },
        {
          selector: "CallExpression > MemberExpression[property.name='toFixed']",
          message: ".toFixed() on an amount is float money. Use src/lib/money.ts. (01 §2.2)",
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message: "parseFloat on an amount reintroduces float money. (01 §2.2)",
        },
      ],
    },
  },

  // Bootstrap surfaces: seeds, scripts and tests run BEFORE or OUTSIDE the app, so they
  // legitimately read process.env directly and construct their own Prisma client. They
  // are not request-path code and no secret reaches a user through them.
  {
    files: ["prisma/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts", "*.config.{ts,mts,mjs,js}"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
