// Entry point loaded by every page. Wires the shared header, then loads the page controller.
import { initSession } from './controllers/sessionController.js';

const pages = {
  programs: './controllers/programsController.js',
  announcements: './controllers/announcementsController.js',
  faculty: './controllers/facultyController.js',
  login: './controllers/authController.js',
  admission: './controllers/inquiryPageController.js',
  contact: './controllers/inquiryPageController.js',
  dashboard: './controllers/dashboardController.js',
};

initSession();
const target = pages[document.body.dataset.page];
if (target) {
  import(target).then((m) => m.init()).catch((err) => {
    console.error(err);
    const main = document.getElementById('main');
    if (main) main.append(Object.assign(document.createElement('p'),
      { className: 'state state-error', role: 'alert', textContent: 'This page could not be started. Please refresh and try again.' }));
  });
}
