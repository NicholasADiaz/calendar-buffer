# calendar-buffer
A script intended to add buffer blocks in google calendar to avoid overlapping meetings.

The script adjusts depending on if the original event was moved, or deleted. If the original event was moved, the script will detect this, delete the old buffers, and place new buffers on the new event. 

Currently, the script looks at any events taking place and only applies the buffers if they meet 2 criteria.
1 - If the event organizer is included on the list of "allowed organizers" who will trigger a buffer event
2 - The original event is longer than a set amount of time (default 45 minutes).

The buffer events can also have their duration changed, extended or shortened, without altering or being "fixed" by the script.

The script runs every 1 minute to catch any new events as they occur.
