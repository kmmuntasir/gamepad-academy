Now that the MVP is live on https://gamepad-academy.com/ (we need to update it in the README.md), we need to focus on improving the UX.

Currently, it's just a website, where on the homepage the visitors can click on a game (with mouse) and then take the controller to start playing. We need the entire website experience to be like a console experience. So that when a user enters the website, he can leave mouse and keyboard, and take the controller and do EVERYTHING.

The homepage needs to be redesigned, and the whole theme needs to be reimagined to be completely retro, 80's game theme. We'll also modify each game to be in retro theme, but let's focus on the homepage for now.

I think we can take a look at the @Alekfull-NX.jpg file, it's the screenshot of the Alekfull-NX themed homepage of Batocera linux, a distro focused on console gaming for retro gamers.

The users can use the gamepad to navigate. BTW, there should be a "Settings" menu, where the user can configure some settings. Example: There should be a feature to show the controller as a top-right corner overlay where each buttonpress should be shown in real-time. A user should be able to enable or disable this overlay in the settings page. We may add more features later in this settings page (suggest some).

I took screenshots of all our 11 games in the game-screenshots directory. These images are of different dimensions, so the html view must handle this gracefully, if an image grid is used, it should never distort the aspect ratio of the images, containing the images in the grid is preferred.
