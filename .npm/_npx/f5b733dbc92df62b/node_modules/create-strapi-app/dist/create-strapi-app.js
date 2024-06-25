"use strict";
const node_fs = require("node:fs");
const node_path = require("node:path");
const commander = require("commander");
const generateNew = require("@strapi/generate-new");
const inquirer = require("inquirer");
const cloudCli = require("@strapi/cloud-cli");
const chalk = require("chalk");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const commander__default = /* @__PURE__ */ _interopDefault(commander);
const inquirer__default = /* @__PURE__ */ _interopDefault(inquirer);
const chalk__default = /* @__PURE__ */ _interopDefault(chalk);
async function promptUser(projectName, program, hasDatabaseOptions) {
  return inquirer__default.default.prompt([
    {
      type: "input",
      default: "my-strapi-project",
      name: "directory",
      message: "What would you like to name your project?",
      when: !projectName
    },
    {
      type: "list",
      name: "quick",
      message: "Choose your installation type",
      when: !program.quickstart && !hasDatabaseOptions,
      choices: [
        {
          name: "Quickstart (recommended)",
          value: true
        },
        {
          name: "Custom (manual settings)",
          value: false
        }
      ]
    }
  ]);
}
const supportedStyles = {
  magentaBright: chalk__default.default.magentaBright,
  blueBright: chalk__default.default.blueBright,
  yellowBright: chalk__default.default.yellowBright,
  green: chalk__default.default.green,
  red: chalk__default.default.red,
  bold: chalk__default.default.bold,
  italic: chalk__default.default.italic
};
function parseToChalk(template) {
  let result = template;
  for (const [color, chalkFunction] of Object.entries(supportedStyles)) {
    const regex = new RegExp(`{${color}}(.*?){/${color}}`, "g");
    result = result.replace(regex, (_, p1) => chalkFunction(p1.trim()));
  }
  return result;
}
function assertCloudError(e) {
  if (e.response === void 0) {
    throw Error("Expected CloudError");
  }
}
async function handleCloudProject(projectName) {
  const logger = cloudCli.services.createLogger({
    silent: false,
    debug: process.argv.includes("--debug"),
    timestamp: false
  });
  let cloudApiService = await cloudCli.services.cloudApiFactory();
  const defaultErrorMessage = "An error occurred while trying to interact with Strapi Cloud. Use strapi deploy command once the project is generated.";
  try {
    const { data: config } = await cloudApiService.config();
    logger.log(parseToChalk(config.projectCreation.introText));
  } catch (e) {
    logger.debug(e);
    logger.error(defaultErrorMessage);
    return;
  }
  const { userChoice } = await inquirer__default.default.prompt([
    {
      type: "list",
      name: "userChoice",
      message: `Please log in or sign up.`,
      choices: ["Login/Sign up", "Skip"]
    }
  ]);
  if (userChoice !== "Skip") {
    const cliContext = {
      logger,
      cwd: process.cwd()
    };
    const projectCreationSpinner = logger.spinner("Creating project on Strapi Cloud");
    try {
      const tokenService = await cloudCli.services.tokenServiceFactory(cliContext);
      const loginSuccess = await cloudCli.cli.login.action(cliContext);
      if (!loginSuccess) {
        return;
      }
      logger.debug("Retrieving token");
      const token = await tokenService.retrieveToken();
      cloudApiService = await cloudCli.services.cloudApiFactory(token);
      logger.debug("Retrieving config");
      const { data: config } = await cloudApiService.config();
      logger.debug("config", config);
      const defaultProjectValues = config.projectCreation?.defaults || {};
      logger.debug("default project values", defaultProjectValues);
      projectCreationSpinner.start();
      const { data: project } = await cloudApiService.createProject({
        nodeVersion: process.versions?.node?.slice(1, 3) || "20",
        region: "NYC",
        plan: "trial",
        ...defaultProjectValues,
        name: projectName
      });
      projectCreationSpinner.succeed("Project created on Strapi Cloud");
      const projectPath = node_path.resolve(projectName);
      logger.debug(project, projectPath);
      await cloudCli.services.local.save({ project }, { directoryPath: projectPath });
    } catch (e) {
      logger.debug(e);
      try {
        assertCloudError(e);
        if (e.response.status === 403) {
          const message = typeof e.response.data === "string" ? e.response.data : "We are sorry, but we are not able to create a Strapi Cloud project for you at the moment.";
          if (projectCreationSpinner.isSpinning) {
            projectCreationSpinner.fail(message);
          } else {
            logger.warn(message);
          }
          return;
        }
      } catch (e2) {
      }
      if (projectCreationSpinner.isSpinning) {
        projectCreationSpinner.fail(defaultErrorMessage);
      } else {
        logger.error(defaultErrorMessage);
      }
    }
  }
}
const packageJson = JSON.parse(node_fs.readFileSync(node_path.resolve(__dirname, "../package.json"), "utf8"));
const command = new commander__default.default.Command(packageJson.name);
const databaseOptions = [
  "dbclient",
  "dbhost",
  "dbport",
  "dbname",
  "dbusername",
  "dbpassword",
  "dbssl",
  "dbfile"
];
command.version(packageJson.version).arguments("[directory]").option("--no-run", "Do not start the application after it is created").option("--use-npm", "Force usage of npm instead of yarn to create the project").option("--debug", "Display database connection error").option("--quickstart", "Quickstart app creation").option("--skip-cloud", "Skip cloud login and project creation").option("--dbclient <dbclient>", "Database client").option("--dbhost <dbhost>", "Database host").option("--dbport <dbport>", "Database port").option("--dbname <dbname>", "Database name").option("--dbusername <dbusername>", "Database username").option("--dbpassword <dbpassword>", "Database password").option("--dbssl <dbssl>", "Database SSL").option("--dbfile <dbfile>", "Database file path for sqlite").option("--dbforce", "Overwrite database content if any").option("--template <templateurl>", "Specify a Strapi template").option("--ts, --typescript", "Use TypeScript to generate the project").description("create a new application").action((directory, programArgs) => {
  initProject(directory, programArgs);
}).parse(process.argv);
async function generateApp(projectName, options) {
  if (!projectName) {
    console.error("Please specify the <directory> of your project when using --quickstart");
    process.exit(1);
  }
  if (!options.skipCloud) {
    generateNew.checkRequirements();
    await handleCloudProject(projectName);
  }
  return generateNew.generateNewApp(projectName, options).then(() => {
    if (process.platform === "win32") {
      process.exit(0);
    }
  });
}
async function initProject(projectName, programArgs) {
  if (projectName) {
    await generateNew.checkInstallPath(node_path.resolve(projectName));
  }
  const programFlags = command.createHelp().visibleOptions(command).reduce((acc, { short, long }) => [...acc, short, long], []).filter(Boolean);
  if (programArgs.template && programFlags.includes(programArgs.template)) {
    console.error(`${programArgs.template} is not a valid template`);
    process.exit(1);
  }
  const hasDatabaseOptions = databaseOptions.some((opt) => programArgs[opt]);
  if (programArgs.quickstart && hasDatabaseOptions) {
    console.error(
      `The quickstart option is incompatible with the following options: ${databaseOptions.join(
        ", "
      )}`
    );
    process.exit(1);
  }
  if (hasDatabaseOptions) {
    programArgs.quickstart = false;
  }
  if (programArgs.quickstart) {
    return generateApp(projectName, programArgs);
  }
  const prompt = await promptUser(projectName, programArgs, hasDatabaseOptions);
  const directory = prompt.directory || projectName;
  await generateNew.checkInstallPath(node_path.resolve(directory));
  const options = {
    template: programArgs.template,
    quickstart: prompt.quick || programArgs.quickstart
  };
  const generateStrapiAppOptions = {
    ...programArgs,
    ...options
  };
  await generateApp(directory, generateStrapiAppOptions);
}
//# sourceMappingURL=create-strapi-app.js.map
