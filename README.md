# VidCrop

VidCrop lets you crop a video and trim it to a time segment, and that can in turn be scaled down, and saved as a high quality GIF or MP4 video.

It does not however do the video processing / conversion on the web application, but it generates an `ffmpeg` command to run in your shell.

For GIF exports, the command is actually multiple commands, and it is made with bash in mind, in that it chains commands with `&&`, and expects the `rm` command to be present to clean up a temporary file.

Check it out on [vidcrop.michd.me](https://vidcrop.michd.me).

It _kinda_ works on mobile, but I kinda doubt you're going to be running ffmpeg on your phone, so it seems a bit pointless.
If I ever get it to include ffmpeg and do the work in-page, I'll put more of an effort in polishing it for mobile use.

## GIF generation

GIF generation commands are done in 3 steps:

1. Generate a video file that executes the cropping and trimming
2. Convert that intermediate file to a high quality GIF
3. Remove the temporary file.

The GIF generation is very memory-intensive, and depends on the duration of the input video rather than just of the input section, which is why it's done in a second step.

### High-quality GIF?

If you convert a video directly to GIF with ffmpeg, say, like this:

```bash
ffmpeg -i inputvideo.mp4 outputgif.gif
```

It will generate a single palette for the entire animation. GIF is limited to a palette of 256 colors, so for any sort of live action, that'll easily look pretty crap.

The approach vidcrop takes is to use the ffmpeg filter graph to generate a palette for each frame. It leads to a larger file of course, but it'll be much higher quality looking.

The command looks more complex though. Without any cropping or trimming:

```bash
ffmpeg -i inputvideo.mp4 -vf "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 outputgif.gif
```

Experiment with scaling down the output and keeping the duration short. I seem to get reasonable results if I keep the greatest dimension under 500 pixels, and keep the gif < 5 seconds.

For an example: this GIF is 1.080 seconds long, 50 frames per second, is 504x400 pixels, and comes in at 4.7MiB.

![Aurora Asksnes at Roskilde 2024](https://github.com/michd/VidCrop/blob/main/examples/aurora-tddl-roskilde2024-withyou.gif)

(From YouTube: [AURORA - When The Dark Dresses Lightly (Live from Roskilde Festival / 05.07.2024) HQ](https://youtu.be/gPerIoo1UsE?t=67))

Note: VidCrop does not detect the framerate of the input video, and at present does not set an output framerate. As a result, your output file (be it GIF or MP4) will have the same frame rate as the input video.

---

## Development

Since this is a side project I made to _enjoy_ myself, there are no frameworks or build systems involved. The whole project is in pure hand-written HTML, CSS, JavaScript without any pre-processing.

It does make use of some fairly modern (to me) web technologies like

- JavaScript class
- CSS nested selectors

### Getting started

Clone the repository and open it in your favorite editor. Open public/index.html in your browser.

### JS Code organisation

The first two files, util.js and core.js, contain common classes and functions used throughout the rest of the application.

Then follows a list of components are each concerned with one area, but each don't know directly of the others.

Finally app.js is what sets them all up and sets up the passing around of data in response to events.

#### core.js

`ObservableProperty`, `ObservableEmitter` are classes that provide functionality for watching something for changes or events. They're inspired by `flows` in kotlin, kind of.

There are some adjacent classes in there for which you can probably work out the point from their names.

Further in core.js are some fairly primitive data classes with a bunch of baked in utilities that allows the code that uses them to remain focused.

#### video_model.js

Business logic for crop/trim data and video dimensions. Other components can make changes, which get passed to this class, which in turn constrains any input to allowable ranges, and outputs the resulting changes to its properties.

#### file_picker_view.js

File selector + drag drop. Also display the currently selected filename and size, any errors that may have occurred in trying to open a file. Cheats a little but because some errors may come from view_view.js, but get displayed here through plumbing in app.js.

#### video_view.js

Wrapper around `<video>`, with a bit of logic for looping between the start and end points of the selected time range. Also contains a time interpolation component so we can measure time with more precision than the maybe once per second updates the browser provides. This is important for setting start/end points.

When paused, this also tracks the current start or end point by seeking to that point in the video whenever start/end changes.

#### playback_control_view.js

The play/pause and mute/unmute buttons. Also handles keyboard commands for these two (`spacebar` / `m`, as long as no inputs are focused.)

#### crop_controller.js

Manages a `<canvas>` that overlays the `<video>` + buttons and info display. When the crop editor is active, you can resize and move a rectangle to indicate which portion of the video to crop to. When not editing, everything but this portion is overlaid by a semitransparent black cover.

The crop controller communicates what the user is trying to do in terms of cropping, which app.js connects to video_model.js. Actual changes to the crop are then communicated back to crop_controller.js to draw the new crop rectangle.

crop_controller.js communicates coordinates and sizes in ratios of the video dimensions, allowing it to not have to care about the actual size of the video; it only has to deal with the UI elements.

#### time_range_controller.js

Allows setting seeking, and setting start and end points. This is done with draggable markets as well as sets of buttons for finer control.
The `<` `>` buttons are a small step, while the `<<` `>>` buttons are a larger step. Further control is available by holding shift (larger step) or control (smaller step) while clicking these.

In addition to these controls, seeking in the timeline can be done with the arrow keys on the keyboard, as well as `,` and `.` for a smaller step. Pressing `s` will set the start point to the currently seeked-to time, `e` will set the end point.

I should probably implement a help screen that lists all these keyboard commands within the thing itself.

#### command_generator_controller.js

Handles the options UI for the command generator + generating the command itself. It also derives a "default" output filename from the input filename and the crop/timerange selection + scale. This can be pretty lengthy, so it can be overriden. If overridden, it keeps track of that, so it doesn't regenerate a new name when you change any of the settings. This can of course be reset with the, you guessed it, reset button.

The settings are divided into subsections, which can be collapsed, at which point they show a summary of what's configured inside. In retrospect that's kind of entirely pointless, but I liked the idea of generating a summary for the `<details>`-contained `<summary>` element.

#### app.js

As mentioned, this glues all the bits together, and shows/hides large bits of the interface as needed.
