import {MusicPartManagerIterator} from "../MusicalScore/MusicParts/MusicPartManagerIterator";
import {MusicPartManager} from "../MusicalScore/MusicParts/MusicPartManager";
import {VoiceEntry} from "../MusicalScore/VoiceData/VoiceEntry";
import {VexFlowStaffEntry} from "../MusicalScore/Graphical/VexFlow/VexFlowStaffEntry";
import {MusicSystem} from "../MusicalScore/Graphical/MusicSystem";
import {OpenSheetMusicDisplay} from "./OpenSheetMusicDisplay";
import {GraphicalMusicSheet} from "../MusicalScore/Graphical/GraphicalMusicSheet";
import {Instrument} from "../MusicalScore/Instrument";
import {Note} from "../MusicalScore/VoiceData/Note";
import {Fraction} from "../Common/DataObjects/Fraction";
import { EngravingRules } from "../MusicalScore/Graphical/EngravingRules";
import { SourceMeasure } from "../MusicalScore/VoiceData/SourceMeasure";
import { StaffLine } from "../MusicalScore/Graphical/StaffLine";
import { GraphicalMeasure } from "../MusicalScore/Graphical/GraphicalMeasure";
import { VexFlowMeasure } from "../MusicalScore/Graphical/VexFlow/VexFlowMeasure";
import { IPlaybackListener } from "../Common/Interfaces/IPlaybackListener";
import { CursorPosChangedData } from "../Common/DataObjects/CursorPosChangedData";
import { PointF2D } from "../Common/DataObjects";

/**
 * A cursor which can iterate through the music sheet.
 */
export class Cursor implements IPlaybackListener {
  constructor(container: HTMLElement, openSheetMusicDisplay: OpenSheetMusicDisplay) {
    this.container = container;
    this.openSheetMusicDisplay = openSheetMusicDisplay;
    this.rules = this.openSheetMusicDisplay.EngravingRules;

    // set cursor id
    // TODO add this for the OSMD object as well and refactor this into a util method?
    let id: number = 0;
    this.cursorElementId = "cursorImg-0";
    // find unique cursor id in document
    while (document.getElementById(this.cursorElementId)) {
      id++;
      this.cursorElementId = `cursorImg-${id}`;
    }

    const curs: HTMLElement = document.createElement("img");
    curs.id = this.cursorElementId;
    curs.style.position = "absolute";
    curs.style.zIndex = "-1";
    this.cursorElement = <HTMLImageElement>curs;
    this.container.appendChild(curs);
  }
  public cursorPositionChanged(timestamp: Fraction, data: CursorPosChangedData): void {
    // if (this.iterator.CurrentEnrolledTimestamp.lt(timestamp)) {
    //   this.iterator.moveToNext();
    //   while (this.iterator.CurrentEnrolledTimestamp.lt(timestamp)) {
    //     this.iterator.moveToNext();
    //   }
    // } else if (this.iterator.CurrentEnrolledTimestamp.gt(timestamp)) {
    //   this.iterator = new MusicPartManagerIterator(this.manager.MusicSheet, timestamp);
    // }

    this.updateWithTimestamp(data.PredictedPosition);
  }
  public pauseOccurred(o: object): void {
    // throw new Error("Method not implemented.");
  }
  public selectionEndReached(o: object): void {
    // throw new Error("Method not implemented.");
  }
  public resetOccurred(o: object): void {
    this.reset();
  }
  public notesPlaybackEventOccurred(o: object): void {
    // throw new Error("Method not implemented.");
  }

  private container: HTMLElement;
  public cursorElement: HTMLImageElement;
  /** a unique id of the cursor's HTMLElement in the document.
   * Should be constant between re-renders and backend changes,
   * but different between different OSMD objects on the same page.
   */
  public cursorElementId: string;
  private openSheetMusicDisplay: OpenSheetMusicDisplay;
  private rules: EngravingRules;
  private manager: MusicPartManager;
  public iterator: MusicPartManagerIterator;
  private graphic: GraphicalMusicSheet;
  public hidden: boolean = false;
  public currentPageNumber: number = 1;

  /** Initialize the cursor. Necessary before using functions like show() and next(). */
  public init(manager: MusicPartManager, graphic: GraphicalMusicSheet): void {
    this.manager = manager;
    this.graphic = graphic;
    this.reset();
    this.hidden = false;
  }

  /**
   * Make the cursor visible
   */
  public show(): void {
    this.hidden = false;
    //this.resetIterator(); // TODO maybe not here? though setting measure range to draw, rerendering, then handling cursor show is difficult
    this.update();
  }

  public resetIterator(): void {
    if (!this.openSheetMusicDisplay.Sheet || !this.openSheetMusicDisplay.Sheet.SourceMeasures) { // just a safety measure
      console.log("OSMD.Cursor.resetIterator(): sheet or measures were null/undefined.");
      return;
    }

    // set selection start, so that when there's MinMeasureToDraw set, the cursor starts there right away instead of at measure 1
    const lastSheetMeasureIndex: number = this.openSheetMusicDisplay.Sheet.SourceMeasures.length - 1; // last measure in data model
    let startMeasureIndex: number = this.rules.MinMeasureToDrawIndex;
    startMeasureIndex = Math.min(startMeasureIndex, lastSheetMeasureIndex);
    let endMeasureIndex: number = this.rules.MaxMeasureToDrawIndex;
    endMeasureIndex = Math.min(endMeasureIndex, lastSheetMeasureIndex);

    if (!this.openSheetMusicDisplay.Sheet.SelectionStart && this.openSheetMusicDisplay.Sheet &&
       this.openSheetMusicDisplay.Sheet.SourceMeasures.length > startMeasureIndex) {
      this.openSheetMusicDisplay.Sheet.SelectionStart = this.openSheetMusicDisplay.Sheet.SourceMeasures[startMeasureIndex].AbsoluteTimestamp;
    }
    if (this.openSheetMusicDisplay.Sheet && this.openSheetMusicDisplay.Sheet.SourceMeasures.length > endMeasureIndex) {
      const lastMeasure: SourceMeasure = this.openSheetMusicDisplay.Sheet.SourceMeasures[endMeasureIndex];
      this.openSheetMusicDisplay.Sheet.SelectionEnd = Fraction.plus(lastMeasure.AbsoluteTimestamp, lastMeasure.Duration);
    }

    this.iterator = this.manager.getIterator();
  }

  private getStaffEntryFromVoiceEntry(voiceEntry: VoiceEntry): VexFlowStaffEntry {
    const measureIndex: number = voiceEntry.ParentSourceStaffEntry.VerticalContainerParent.ParentMeasure.measureListIndex;
    const staffIndex: number = voiceEntry.ParentSourceStaffEntry.ParentStaff.idInMusicSheet;
    return <VexFlowStaffEntry>this.graphic.findGraphicalStaffEntryFromMeasureList(staffIndex, measureIndex, voiceEntry.ParentSourceStaffEntry);
  }

  public updateWithTimestamp(timestamp: Fraction): void {
    const sheetTimestamp: Fraction = this.manager.absoluteEnrolledToSheetTimestamp(timestamp);

    const values: [number, MusicSystem] = this.graphic.calculateXPositionFromTimestamp(sheetTimestamp);
    const x: number = values[0];
    const currentSystem: MusicSystem = values[1];
    this.updateCurrentPageFromSystem(currentSystem);

    const points: [PointF2D, PointF2D] = this.graphic.calculateCursorPoints(x, currentSystem);
    const y: number = points[0].y;
    const height: number = points[1].y - y;

    // This the current HTML Cursor:
    const cursorElement: HTMLImageElement = this.cursorElement;
    cursorElement.style.top = (y * 10.0 * this.openSheetMusicDisplay.zoom) + "px";
    cursorElement.style.left = ((x - 1.5) * 10.0 * this.openSheetMusicDisplay.zoom) + "px";
    const newHeight: number = (height * 10.0 * this.openSheetMusicDisplay.zoom);
    cursorElement.height = newHeight;
    cursorElement.style.height = newHeight + "px";
    const newWidth: number = 3 * 10.0 * this.openSheetMusicDisplay.zoom;
    if (newWidth !== cursorElement.width) {
      cursorElement.width = newWidth;
      cursorElement.style.width = cursorElement.width + "px";
      this.updateStyle(newWidth);
    }
    if (this.openSheetMusicDisplay.FollowCursor) {
      const diff: number = this.cursorElement.getBoundingClientRect().top;
      this.cursorElement.scrollIntoView({behavior: diff < 1000 ? "smooth" : "auto", block: "center"});
    }
    // Show cursor
    // // Old cursor: this.graphic.Cursors.push(cursor);
    this.cursorElement.style.display = "";
  }

  public update(): void {
    if (this.hidden || this.hidden === undefined || this.hidden === null) {
      return;
    }
    this.updateCurrentPage(); // attach cursor to new page DOM if necessary

    // this.graphic?.Cursors?.length = 0;
    const iterator: MusicPartManagerIterator = this.iterator;
    // TODO when measure draw range (drawUpToMeasureNumber) was changed, next/update can fail to move cursor. but of course it can be reset before.

    const voiceEntries: VoiceEntry[] = iterator.CurrentVisibleVoiceEntries();
    if (iterator.EndReached || !iterator.CurrentVoiceEntries || voiceEntries.length === 0) {
      return;
    }
    let x: number = 0, y: number = 0, height: number = 0;
    let musicSystem: MusicSystem;
    if (iterator.CurrentMeasure.isReducedToMultiRest) {
      const multiRestGMeasure: GraphicalMeasure = this.graphic.findGraphicalMeasure(iterator.CurrentMeasureIndex, 0);
      const totalRestMeasures: number = multiRestGMeasure.parentSourceMeasure.multipleRestMeasures;
      const currentRestMeasureNumber: number = iterator.CurrentMeasure.multipleRestMeasureNumber;
      const progressRatio: number = currentRestMeasureNumber / (totalRestMeasures + 1);
      const effectiveWidth: number = multiRestGMeasure.PositionAndShape.Size.width - (multiRestGMeasure as VexFlowMeasure).beginInstructionsWidth;
      x = multiRestGMeasure.PositionAndShape.AbsolutePosition.x + (multiRestGMeasure as VexFlowMeasure).beginInstructionsWidth + progressRatio * effectiveWidth;

      musicSystem = multiRestGMeasure.ParentMusicSystem;
    } else {
          // get all staff entries inside the current voice entry
          const gseArr: VexFlowStaffEntry[] = voiceEntries.map(ve => this.getStaffEntryFromVoiceEntry(ve));
          // sort them by x position and take the leftmost entry
          const gse: VexFlowStaffEntry =
                gseArr.sort((a, b) => a?.PositionAndShape?.AbsolutePosition?.x <= b?.PositionAndShape?.AbsolutePosition?.x ? -1 : 1 )[0];
          x = gse.PositionAndShape.AbsolutePosition.x;
          musicSystem = gse.parentMeasure.ParentMusicSystem;

          // debug: change color of notes under cursor (needs re-render)
          // for (const gve of gse.graphicalVoiceEntries) {
          //   for (const note of gve.notes) {
          //     note.sourceNote.NoteheadColor = "#0000FF";
          //   }
          // }
    }
    if (!musicSystem) {
      return;
    }

    // y is common for both multirest and non-multirest, given the MusicSystem
    y = musicSystem.PositionAndShape.AbsolutePosition.y + musicSystem.StaffLines[0].PositionAndShape.RelativePosition.y;
    const bottomStaffline: StaffLine = musicSystem.StaffLines[musicSystem.StaffLines.length - 1];
    const endY: number = musicSystem.PositionAndShape.AbsolutePosition.y +
    bottomStaffline.PositionAndShape.RelativePosition.y + bottomStaffline.StaffHeight;
    height = endY - y;

    // Update the graphical cursor
    // The following is the legacy cursor rendered on the canvas:
    // // let cursor: GraphicalLine = new GraphicalLine(new PointF2D(x, y), new PointF2D(x, y + height), 3, OutlineAndFillStyleEnum.PlaybackCursor);

    // This the current HTML Cursor:
    const cursorElement: HTMLImageElement = this.cursorElement;
    cursorElement.style.top = (y * 10.0 * this.openSheetMusicDisplay.zoom) + "px";
    cursorElement.style.left = ((x - 1.5) * 10.0 * this.openSheetMusicDisplay.zoom) + "px";
    const newHeight: number = (height * 10.0 * this.openSheetMusicDisplay.zoom);
    cursorElement.height = newHeight;
    cursorElement.style.height = newHeight + "px";
    const newWidth: number = 3 * 10.0 * this.openSheetMusicDisplay.zoom;
    if (newWidth !== cursorElement.width) {
      cursorElement.width = newWidth;
      cursorElement.style.width = newWidth + "px";
      this.updateStyle(newWidth);
    }
    if (this.openSheetMusicDisplay.FollowCursor) {
      const diff: number = this.cursorElement.getBoundingClientRect().top;
      this.cursorElement.scrollIntoView({behavior: diff < 1000 ? "smooth" : "auto", block: "center"});
    }
    // Show cursor
    // // Old cursor: this.graphic.Cursors.push(cursor);
    this.cursorElement.style.display = "";
  }

  /**
   * Hide the cursor
   */
  public hide(): void {
    // Hide the actual cursor element
    this.cursorElement.style.display = "none";
    //this.graphic.Cursors.length = 0;
    // Forcing the sheet to re-render is not necessary anymore
    //if (!this.hidden) {
    //    this.openSheetMusicDisplay.render();
    //}
    this.hidden = true;
  }

  /**
   * Go to next entry
   */
  public next(): void {
    this.iterator.moveToNextVisibleVoiceEntry(false); // moveToNext() would not skip notes in hidden (visible = false) parts
    this.update();
  }

  /**
   * reset cursor to start
   */
  public reset(): void {
    this.resetIterator();
    //this.iterator.moveToNext();
    const iterTmp: MusicPartManagerIterator = this.manager.getIterator(this.graphic.ParentMusicSheet.SelectionStart);
    this.updateWithTimestamp(iterTmp.CurrentEnrolledTimestamp);
  }

  private updateStyle(width: number, color: string = undefined): void {
    if (!color) {
      color = this.rules.DefaultColorCursor;
    }
    // Create a dummy canvas to generate the gradient for the cursor
    // FIXME This approach needs to be improved
    const c: HTMLCanvasElement = document.createElement("canvas");
    c.width = this.cursorElement.width;
    c.height = 1;
    const ctx: CanvasRenderingContext2D = c.getContext("2d");
    ctx.globalAlpha = 0.5;
    // Generate the gradient
    const gradient: CanvasGradient = ctx.createLinearGradient(0, 0, this.cursorElement.width, 0);
    gradient.addColorStop(0, "white"); // it was: "transparent"
    gradient.addColorStop(0.4, color);
    gradient.addColorStop(0.6, color);
    gradient.addColorStop(1, "white"); // it was: "transparent"
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, 1);
    // Set the actual image
    this.cursorElement.src = c.toDataURL("image/png");
  }

  public get Iterator(): MusicPartManagerIterator {
    return this.iterator;
  }

  public get Hidden(): boolean {
    return this.hidden;
  }

  /** returns voices under the current Cursor position. Without instrument argument, all voices are returned. */
  public VoicesUnderCursor(instrument?: Instrument): VoiceEntry[] {
    return this.iterator.CurrentVisibleVoiceEntries(instrument);
  }

  public NotesUnderCursor(instrument?: Instrument): Note[] {
    const voiceEntries: VoiceEntry[]  = this.VoicesUnderCursor(instrument);
    const notes: Note[] = [];
    voiceEntries.forEach(voiceEntry => {
      notes.push.apply(notes, voiceEntry.Notes);
    });
    return notes;
  }

  /** Check if there was a change in current page, and attach cursor element to the corresponding HTMLElement (div).
   *  This is only necessary if using PageFormat (multiple pages).
   */
  public updateCurrentPage(): number {
    const timestamp: Fraction = this.iterator.currentTimeStamp;
    for (const page of this.graphic.MusicPages) {
      const lastSystemTimestamp: Fraction = page.MusicSystems.last().GetSystemsLastTimeStamp();
      if (lastSystemTimestamp.gt(timestamp)) {
        // gt: the last timestamp of the last system is equal to the first of the next page,
        //   so we do need to use gt, not gte here.
        const newPageNumber: number = page.PageNumber;
        if (newPageNumber !== this.currentPageNumber) {
          this.container.removeChild(this.cursorElement);
          this.container = document.getElementById("osmdCanvasPage" + newPageNumber);
          this.container.appendChild(this.cursorElement);
          // TODO maybe store this.pageCurrentlyAttachedTo, though right now it isn't necessary
          // alternative to remove/append:
          // this.openSheetMusicDisplay.enableOrDisableCursor(true);
        }
        return this.currentPageNumber = newPageNumber;
      }
    }
    return 1;
  }

  public updateCurrentPageFromSystem(system: MusicSystem): number {
    if (system !== undefined) {
      const newPageNumber: number = system.Parent.PageNumber;
      if (newPageNumber !== this.currentPageNumber) {
        this.container.removeChild(this.cursorElement);
        this.container = document.getElementById("osmdCanvasPage" + newPageNumber);
        this.container.appendChild(this.cursorElement);
        // TODO maybe store this.pageCurrentlyAttachedTo, though right now it isn't necessary
        // alternative to remove/append:
        // this.openSheetMusicDisplay.enableOrDisableCursor(true);
      }
      return this.currentPageNumber = newPageNumber;
    }
    return 1;
  }
}
