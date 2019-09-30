import {
    _,
    AbstractColDef,
    Autowired, ColGroupDef,
    Column,
    ColumnApi,
    ColumnController,
    Component,
    Events,
    EventService,
    GridOptionsWrapper,
    OriginalColumnGroup,
    OriginalColumnGroupChild,
} from "ag-grid-community";
import {ToolPanelColumnGroupComp} from "./toolPanelColumnGroupComp";
import {ToolPanelColumnComp} from "./toolPanelColumnComp";
import {BaseColumnItem} from "./primaryColsPanel";
import {SELECTED_STATE} from "./primaryColsHeaderPanel";
import {ToolPanelColumnCompParams} from "../../columnToolPanel";
import {ToolPanelColDefService} from "../../../toolPanelColDefService";

export type ColumnItem = BaseColumnItem & Component;

export class PrimaryColsListPanel extends Component {

    @Autowired('gridOptionsWrapper') private gridOptionsWrapper: GridOptionsWrapper;
    @Autowired('columnController') private columnController: ColumnController;
    @Autowired('toolPanelColDefService') private toolPanelColDefService: ToolPanelColDefService;
    @Autowired('eventService') private globalEventService: EventService;
    @Autowired('columnApi') private columnApi: ColumnApi;

    private allowDragging: boolean;
    private params: ToolPanelColumnCompParams;

    private columnTree: OriginalColumnGroupChild[];
    private columnComps: { [key: string]: ColumnItem };

    private filterText: string | null;

    private expandGroupsByDefault: boolean;

    public static TEMPLATE = `<div class="ag-primary-cols-list-panel"></div>`;

    constructor() {
        super(PrimaryColsListPanel.TEMPLATE);
    }

    public init(params: ToolPanelColumnCompParams, allowDragging: boolean): void {
        this.params = params;
        this.allowDragging = allowDragging;

        if (this.params.syncLayoutWithGrid) {
            this.addDestroyableEventListener(this.globalEventService, Events.EVENT_COLUMN_MOVED, this.syncColumnLayout.bind(this));
        }

        this.addDestroyableEventListener(this.globalEventService, Events.EVENT_COLUMN_EVERYTHING_CHANGED, this.onColumnsChanged.bind(this));

        this.expandGroupsByDefault = !this.params.contractColumnSelection;
        if (this.columnController.isReady()) {
            this.onColumnsChanged();
        }
    }

    public onColumnsChanged(): void {
        this.destroyColumnComps();
        this.columnTree = this.columnController.getPrimaryColumnTree();
        const groupsExist = this.columnController.isPrimaryColumnGroupsPresent();
        this.recursivelyAddComps(this.columnTree, 0, groupsExist);
        this.updateVisibilityOfRows();
    }

    public setColumnLayout(colDefs: AbstractColDef[]): void {
        this.destroyColumnComps();
        this.columnTree = this.toolPanelColDefService.createColumnTree(colDefs);

        const isColGroupDef = (colDef: AbstractColDef) => {
            return colDef && typeof (colDef as ColGroupDef).children !== 'undefined';
        };

        const groupsExist = colDefs.filter(isColGroupDef).length > 0;
        this.recursivelyAddComps(this.columnTree, 0, groupsExist);
        this.updateVisibilityOfRows();
    }

    public syncColumnLayout(): void {
        this.toolPanelColDefService.syncLayoutWithGrid(this.setColumnLayout.bind(this));
    }

    private recursivelyAddComps(tree: OriginalColumnGroupChild[], dept: number, groupsExist: boolean): void {
        tree.forEach(child => {
            if (child instanceof OriginalColumnGroup) {
                this.recursivelyAddGroupComps(child as OriginalColumnGroup, dept, groupsExist);
            } else {
                this.addColumnComps(child as Column, dept, groupsExist);
            }
        });
    }

    private recursivelyAddGroupComps(columnGroup: OriginalColumnGroup, dept: number, groupsExist: boolean): void {
        // only render group if user provided the definition
        let newDept: number;

        if (columnGroup.getColGroupDef() && columnGroup.getColGroupDef().suppressToolPanel) {
            return;
        }

        if (!columnGroup.isPadding()) {
            const renderedGroup = new ToolPanelColumnGroupComp(columnGroup, dept, this.onGroupExpanded.bind(this),
                this.allowDragging, this.expandGroupsByDefault);
            this.getContext().wireBean(renderedGroup);
            this.getGui().appendChild(renderedGroup.getGui());
            // we want to indent on the gui for the children
            newDept = dept + 1;

            this.columnComps[columnGroup.getId()] = renderedGroup;
        } else {
            // no children, so no indent
            newDept = dept;
        }

        this.recursivelyAddComps(columnGroup.getChildren(), newDept, groupsExist);
    }

    private addColumnComps(column: Column, dept: number, groupsExist: boolean): void {
        if (column.getColDef() && column.getColDef().suppressToolPanel) {
            return;
        }

        const columnComp = new ToolPanelColumnComp(column, dept, this.allowDragging, groupsExist);
        this.getContext().wireBean(columnComp);
        this.getGui().appendChild(columnComp.getGui());

        this.columnComps[column.getId()] = columnComp;
    }

    public onGroupExpanded(): void {
        this.updateVisibilityOfRows();
        this.fireExpandedEvent();
    }

    private fireExpandedEvent(): void {
        let expandedCount = 0;
        let notExpandedCount = 0;

        const recursiveFunc = (items: OriginalColumnGroupChild[]) => {
            items.forEach(item => {
                // only interested in groups
                if (item instanceof OriginalColumnGroup) {
                    const comp = this.columnComps[item.getId()] as ToolPanelColumnGroupComp;

                    if (comp) {
                        if (comp.isExpanded()) {
                            expandedCount++;
                        } else {
                            notExpandedCount++;
                        }
                    }

                    const columnGroup = item as OriginalColumnGroup;
                    const groupChildren = columnGroup.getChildren();

                    recursiveFunc(groupChildren);
                }
            });
        };

        recursiveFunc(this.columnTree);

        let state: SELECTED_STATE;
        if (expandedCount > 0 && notExpandedCount > 0) {
            state = SELECTED_STATE.INDETERMINATE;
        } else if (notExpandedCount > 0) {
            state = SELECTED_STATE.UNCHECKED;
        } else {
            state = SELECTED_STATE.CHECKED;
        }

        this.dispatchEvent({type: 'groupExpanded', state: state});
    }

    public doSetExpandedAll(value: boolean): void {
        _.iterateObject(this.columnComps, (key, renderedItem) => {
            if (renderedItem.isExpandable()) {
                renderedItem.setExpanded(value);
            }
        });
    }

    public setGroupsExpanded(expand: boolean, groupIds?: string[]): void {
        const expandedGroupIds: string[] = [];

        if (!groupIds) {
            this.doSetExpandedAll(expand);
        } else {
            _.iterateObject(this.columnComps, (key, renderedItem) => {
                const shouldSetGroupExpanded = renderedItem.isExpandable() && groupIds.indexOf(key) > -1;
                if (shouldSetGroupExpanded) {
                    renderedItem.setExpanded(expand);
                    expandedGroupIds.push(key);
                }
            });
        }

        if (groupIds) {
            const unrecognisedGroupIds = groupIds.filter(groupId => expandedGroupIds.indexOf(groupId) < 0);
            if (unrecognisedGroupIds.length > 0) {
                console.warn('ag-Grid: unable to find group(s) for supplied groupIds:', unrecognisedGroupIds);
            }
        }
    }

    public doSetSelectedAll(checked: boolean): void {
        if (this.columnApi.isPivotMode()) {
            // if pivot mode is on, then selecting columns has special meaning (eg group, aggregate, pivot etc),
            // so there is no bulk operation we can do.
            _.iterateObject(this.columnComps, (key, column) => {
                column.onSelectAllChanged(checked);
            });
        } else {
            // however if pivot mode is off, then it's all about column visibility so we can do a bulk
            // operation directly with the column controller. we could column.onSelectAllChanged(checked)
            // as above, however this would work on each column independently and take longer.
            const primaryCols = this.columnApi.getPrimaryColumns();
            this.columnApi.setColumnsVisible(primaryCols, checked);
        }
    }

    public setFilterText(filterText: string) {
        this.filterText = _.exists(filterText) ? filterText.toLowerCase() : null;
        this.updateVisibilityOfRows();
    }

    private updateVisibilityOfRows(): void {
        // we have to create the filter results first as that requires dept first search, then setting
        // the visibility requires breadth first search. this is because a group passes filter if CHILDREN
        // pass filter, a column passes group open/closed visibility if a PARENT is open. so we need to do
        // two recursions. we pass the result of the first recursion to the second.
        const filterResults: { [id: string]: boolean } | null = _.exists(this.filterText) ? this.createFilterResults() : null;
        this.recursivelySetVisibility(this.columnTree, true, filterResults);
    }

    private createFilterResults(): { [id: string]: boolean } {
        const filterResults: { [id: string]: boolean } = {};

        // we recurse dept first - as the item should show if any of the children are showing

        const recursivelyCheckFilter = (items: OriginalColumnGroupChild[]): boolean => {
            let atLeastOneThisLevelPassed = false;

            items.forEach(item => {
                let atLeastOneChildPassed = false;

                if (item instanceof OriginalColumnGroup) {
                    const groupChildren = item.getChildren();
                    atLeastOneChildPassed = recursivelyCheckFilter(groupChildren);
                }

                let filterPasses: boolean;
                if (atLeastOneChildPassed) {
                    filterPasses = true;
                } else {
                    const comp = this.columnComps[item.getId()];
                    if (comp && this.filterText) {
                        const displayName = comp.getDisplayName();
                        filterPasses = displayName !== null ? displayName.toLowerCase().indexOf(this.filterText) >= 0 : true;
                    } else {
                        // if this is a dummy column group, we should return false here
                        filterPasses = !!(item instanceof OriginalColumnGroup && item.getOriginalParent());
                    }
                }

                filterResults[item.getId()] = filterPasses;

                if (filterPasses) {
                    atLeastOneThisLevelPassed = true;
                }
            });

            return atLeastOneThisLevelPassed;
        };

        recursivelyCheckFilter(this.columnTree);

        return filterResults;
    }

    private recursivelySetVisibility(columnTree: any[], parentGroupsOpen: boolean,
                                     filterResults: { [id: string]: boolean } | null): void {

        columnTree.forEach(child => {
            const comp: ColumnItem = this.columnComps[child.getId()];
            if (comp) {
                const passesFilter = filterResults ? filterResults[child.getId()] : true;
                comp.setDisplayed(parentGroupsOpen && passesFilter);
            }

            if (child instanceof OriginalColumnGroup) {
                const columnGroup = child;

                let childrenOpen: boolean;
                if (comp) {
                    const expanded = (comp as ToolPanelColumnGroupComp).isExpanded();
                    childrenOpen = parentGroupsOpen ? expanded : false;
                } else {
                    childrenOpen = parentGroupsOpen;
                }

                const children = columnGroup.getChildren();
                this.recursivelySetVisibility(children, childrenOpen, filterResults);
            }
        });
    }

    private destroyColumnComps(): void {
        _.clearElement(this.getGui());
        if (this.columnComps) {
            _.iterateObject(this.columnComps, (key: string, renderedItem: Component) => renderedItem.destroy());
        }
        this.columnComps = {};
    }

    public destroy(): void {
        super.destroy();
        this.destroyColumnComps();
    }
}
