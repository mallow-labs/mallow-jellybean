const path = require('path');

const programDir = path.join(__dirname, 'target', 'deploy');

function getProgram(programName) {
  return path.join(programDir, programName);
}

module.exports = {
  validator: {
    commitment: 'processed',
    accountsCluster: 'http://localhost:8899',
    programs: [
      {
        label: 'Mallow Jellybean',
        programId: 'J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq',
        deployPath: getProgram('mallow_jellybean.so'),
      },
      {
        label: 'Gumball Guard',
        programId: 'GGRDy4ieS7ExrUu313QkszyuT9o3BvDLuc3H5VLgCpSF',
        deployPath: getProgram(
          'GGRDy4ieS7ExrUu313QkszyuT9o3BvDLuc3H5VLgCpSF.so'
        ),
      },
      {
        label: 'SPL Token 2022',
        programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
        deployPath: getProgram(
          'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb.so'
        ),
      },
      {
        label: 'MPL Core',
        programId: 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
        deployPath: getProgram(
          'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d.so'
        ),
      },
    ],
  },
};
