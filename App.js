// This app displays stories for an iteration and shows how long it was in each state

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    
    items: [
        {
            xtype: 'container',
            itemId: 'pulldown-container',
            layout: {
                type: 'hbox',
                align: 'stretch'
            }
        }
    ],
    
    infinity: new Date('9999-01-01T00:00:00.000Z'),
    
    scheduleStates: ['Idea', 'Defined', 'In-Progress', 'Completed', 'Accepted', 'Released'],
    
    launch: function() {
        this._loadIterations();
    },
    
    _loadIterations: function() {
        var me = this;
        
        var iterComboBox = Ext.create('Rally.ui.combobox.IterationComboBox', {
            itemId: 'iteration-combobox',
            fieldLabel: 'Iteration',
            labelAlign: 'right',
            width: 300,
            listeners: {
                select: me._loadUserStories,
                ready: me._loadUserStories,
                scope: me
            }
        });
        
        me.down('#pulldown-container').add(iterComboBox);
    },
    
    _getFiltersForUserStories: function(iterValue) {
        var iterFilter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Iteration',
            operation: '=',
            value: iterValue
        });
        
        return iterFilter;
    },
    
    _loadUserStories: function() {
        var me = this;
        
        var selectedIterRef = me.down('#iteration-combobox').getRecord().get('_ref');
                
        var myFilters = me._getFiltersForUserStories(selectedIterRef);
        
        // If store exists, just reload new data
        if (me.userStoryStore) {
            me.userStoryStore.setFilter(myFilters);
            me.userStoryStore.load();
        } else {
            me.userStoryStore = Ext.create('Rally.data.wsapi.Store', {
                model: 'User Story',
                autoLoad: true,
                filter: myFilters,
                listeners: {
                    load: function(myStore, myData, success) {
                        me.arrayOfUserStories = [];
                        _.each(myData, function(record) {
                            me.arrayOfUserStories.push(record.get('ObjectID'));
                        });                        
                        me._loadLBData();
                    },
                    scope: this
                },
                fetch: ['FormattedID']
            });
        }
    },
    
    _getFiltersForLookback: function(stories) {
            
        var storyFilter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: 'ObjectID',
            operator: 'in',
            value: stories
        });
                
        return storyFilter;
    },
    
    _loadLBData: function() {
        var me = this;
        
        var myLBFilters = me._getFiltersForLookback(me.arrayOfUserStories);
    
        me.snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            filters: myLBFilters,
            hydrate: ['ScheduleState', '_PreviousValues.ScheduleState'],
            fetch: ['FormattedID', '_ValidFrom', '_ValidTo', 'ScheduleState', 'Name', '_PreviousValues', '_PreviousValues.ScheduleState']
        });

        me.snapshotStore.load({
            params : {
                removeUnauthorizedSnapshots : true
            },
            callback : function(records) {
                me._queryAndSortStories(); 
            }
        });
    },
    
    _queryAndSortStories: function() {
        var me = this;
        
        var gridData = [];
        _.each(me.arrayOfUserStories, function(story) {
            snapshotDataForChangedState = me.snapshotStore.queryBy(function(item) {
                return (item.get('_PreviousValues.ScheduleState') !== null) && (item.get('ObjectID') == story);
            });
            
            if (snapshotDataForChangedState.getCount() !== 0) {
                row = me._calcStateTimeForStory(snapshotDataForChangedState);
            
                gridData.push(row);
            }
        });
                
        me._createStore(gridData);
    },
    
    _calcStateTimeForStory: function(stateChangedItems) {
        var me = this;
        
        storyRow = {};
                
        // For each state change, calculate time in that state
        stateChangedItems.each(function(stateRec) {
            var prevState = stateRec.get('ScheduleState');
            
            var from = new Date(stateRec.get('_ValidFrom'));
            var to = new Date(stateRec.get('_ValidTo'));
            
            if (Ext.Date.isEqual(to, me.infinity)) {
                to = new Date();
            }
        
            time = Rally.util.DateTime.getDifference(to, from, 'second');
        
            timeSoFar = storyRow[prevState];
            if (timeSoFar == null) {
                storyRow[prevState] = time;
            }
            else {
                storyRow[prevState] = timeSoFar + time;        
            }
            
            storyRow.FormattedID = stateRec.get('FormattedID');
            storyRow.Name = stateRec.get('Name');
        });
        
        return storyRow;
    },
    
    _createStore: function(data) {
        var me = this;
                
        if (me.myStore) {
            me.myStore.loadData(data);
        } else {
            me.myStore = Ext.create('Ext.data.Store', {
                storeId:'timeInStateStore',
                fields:['FormattedID', 'Name', 'Idea', 'Defined', 'In-Progress', 'Completed', 'Accepted', 'Released'],
                data:{'items': data},
                proxy: {
                    type: 'memory',
                    reader: {
                        type: 'json',
                        root: 'items'
                    }
                }
            });
                
            if (!me.grid) {
                me._createGrid();
            }
        }
    },
    
    _createGrid: function() {
        var me = this;
        
        me.grid = Ext.create('Rally.ui.grid.Grid', {
            columnHeader: false,
            store: me.myStore,
            columnCfgs: [
                { text: 'Story ID',  dataIndex: 'FormattedID' },
                { text: 'Story Name',  dataIndex: 'Name' },
                { text: 'Idea State',  dataIndex: 'Idea', renderer: function(value, metadata, record){ return me._formatTime(value); } },
                { text: 'Defined State',  dataIndex: 'Defined', renderer: function(value, metadata, record){ return me._formatTime(value); } },
                { text: 'In-Progress State',  dataIndex: 'In-Progress', renderer: function(value, metadata, record){ return me._formatTime(value); } },
                { text: 'Completed State',  dataIndex: 'Completed', renderer: function(value, metadata, record){ return me._formatTime(value); } },
                { text: 'Accepted State',  dataIndex: 'Accepted', renderer: function(value, metadata, record){ return me._formatTime(value); } },
                { text: 'Released State',  dataIndex: 'Released', renderer: function(value, metadata, record){ return me._formatTime(value); } }
            ]
        });
        
        me.add(me.grid);
    },
    
    _formatTime: function(valueInSeconds) {
        if (valueInSeconds == 0) {
            return '';
        }
        
        var hours = Ext.util.Format.round((valueInSeconds / 3600), 0);
        if (hours != 0) {
            return hours + ' hour(s)';
        }
        
        var minutes = Ext.util.Format.round((valueInSeconds / 60), 0);
        if (minutes == 0) {
            return '< 1 minute';
        }
        
        return minutes + ' min(s)';
    }
});
