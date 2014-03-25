// leave at least 2 line with only a star on it below, or doc generation fails
/**
 *
 *
 * Placeholder for custom user javascript
 * mainly to be overridden in profile/static/custom/custom.js
 * This will always be an empty file in IPython
 *
 * User could add any javascript in the `profile/static/custom/custom.js` file
 * (and should create it if it does not exist).
 * It will be executed by the ipython notebook at load time.
 *
 * Same thing with `profile/static/custom/custom.css` to inject custom css into the notebook.
 *
 * Example :
 *
 * Create a custom button in toolbar that execute `%qtconsole` in kernel
 * and hence open a qtconsole attached to the same kernel as the current notebook
 *
 *    $([IPython.events]).on('app_initialized.NotebookApp', function(){
 *        IPython.toolbar.add_buttons_group([
 *            {
 *                 'label'   : 'run qtconsole',
 *                 'icon'    : 'icon-terminal', // select your icon from http://fortawesome.github.io/Font-Awesome/icons
 *                 'callback': function () {
 *                     IPython.notebook.kernel.execute('%qtconsole')
 *                 }
 *            }
 *            // add more button here if needed.
 *            ]);
 *    });
 *
 * Example :
 *
 *  Use `jQuery.getScript(url [, success(script, textStatus, jqXHR)] );`
 *  to load custom script into the notebook.
 *
 *    // to load the metadata ui extension example.
 *    $.getScript('/static/notebook/js/celltoolbarpresets/example.js');
 *    // or
 *    // to load the metadata ui extension to control slideshow mode / reveal js for nbconvert
 *    $.getScript('/static/notebook/js/celltoolbarpresets/slideshow.js');
 *
 *
 * @module IPython
 * @namespace IPython
 * @class customjs
 * @static
 */

"using strict";
$([IPython.events]).on('app_initialized.NotebookApp', function(){
    require(['custom/center_equation']);
});

$([IPython.events]).on('notebook_loading.Notebook', function(){
    em_setup_spark();
});

$([IPython.events]).on('notebook_loaded.Notebook', function(){
    em_restore_marks();
});

// Add the spark cell type to IPython.
function em_setup_spark() {
    // The SparkCell class
    var SparkCell = function (options) {
        var options = options || {};

        options = this.mergeopt(SparkCell,options);
        IPython.TextCell.apply(this, [options]);

        this.pyspark = new Spark.PySpark();
        this.operands = [new Spark.Op(0)];
        this.marks = [];

        this.cell_type = 'spark';
    };

    SparkCell.prototype = new IPython.TextCell();

    SparkCell.options_default = {
        cm_config : {
            mode: 'null',
        },
    };

    SparkCell.spark_reset = function (that) {
        that.operands = [new Spark.Op(0)];
        that.rendered = false;
        that.render();
        that.spark_refresh();
    }

    SparkCell.prototype.render = function () {
        if (this.rendered === false) {
            var err = this.set_sig();
            var elem = (err)
                ? $("<div/>").text("Spark: " + err).addClass("js-error")
                : this.spark_menu();
            var tcr = this.element.find('div.text_cell_render');
            tcr.empty();
            tcr.append(elem);
            this.spark_validate();
            this.element.find('div.text_cell_input').hide();
            tcr.show();
            this.rendered = true;

            var outputcell = IPython.notebook.get_next_cell(this);
            if (!(outputcell instanceof IPython.CodeCell)) { return; }
            if (outputcell.get_text() != "") {
                this.spark_refresh();
            }
        }
    };

    SparkCell.prototype.spark_menu = function () {
        var frm = $("<form/>");
        var that = this;
        frm.on("change", function(e){
            SparkCell.spark_update(e, that);
        });

        var hdr = $("<div>"+this.sig.name+this.sig.exargs+"</div>");
        hdr.addClass("spark_hdr");
        var numops = $("<span>Number of operands: </span>")
            .append(SparkCell.spark_selector(
                'numops', null, [1,2,3,4,5], this.operands.length-1));
        var reset = $("<button type='button'>Reset Form</button>");
        reset.on("click", function(e){
            SparkCell.spark_reset(that);
        });

        var tbl = $("<table class='spark'/>");
        tbl.append("<tr class='spark'><td class='spark'>#</td><td class='spark'>Name</td><td class='spark'>Type</td><td class='spark'>Direction</td><td class='spark'>I/O</td></tr>");
        for (i = 0; i < this.operands.length; i++) {
            tbl.append(this.spark_row(i, this.operands[i]));
        }

        frm.append(hdr).append("<hr>").append(reset)
            .append("<br>").append(numops).append(tbl)
        frm.append("<div class='spark_error'/>");
        return frm;
    };

    SparkCell.prototype.spark_row = function(i, op) {
        var row = $("<tr class='spark'/>");

        var opnamesel = SparkCell.spark_selector(
            'opname', i, Spark.Op.Names[Spark.Op.MAT], op.name);
        var optypesel = SparkCell.spark_selector(
            'optype', i, Spark.Op.Types, op.type);
        var opdirsel = SparkCell.spark_selector(
            'opdir', i, Spark.Op.Dirs[op.type], op.dir);
        var opiosel = SparkCell.spark_selector(
            'opio', i, Spark.Op.Ios, op.io);

        optypesel.data('dirs', opdirsel);

        row.append("<td class='spark'>"+(i+1)+": </td>");
        row.append($("<td class='spark'/>").append(opnamesel));
        row.append($("<td class='spark'/>").append(optypesel));
        row.append($("<td class='spark'/>").append(opdirsel));
        row.append($("<td class='spark'/>").append(opiosel));
        return row;
    };

    SparkCell.spark_selector = function (name, opnum, src, curr, sel) {
        if (sel) {
            sel.empty();
        } else {
            var sel = $("<select class='spark'/>");
            sel.data('control', name);
            sel.data('opnum', opnum);
        }
        var idx;
        for (idx = 0; idx < src.length; idx++) {
            var selected = (idx === curr) ? " selected='selected'" : "";
            sel.append("<option value='"+idx+"'"+selected+">"+
                       src[idx]+"</option>");
        }
        return sel;
    };

    SparkCell.spark_update = function (e, that) {
        var target = $(e.target);
        var control = target.data('control');
        if (control === 'numops') {
            var oldnum = that.operands.length;
            var newnum = parseInt(target.val())+1; // +1 since val is 0-based
            var tbl = that.element.find("table.spark");
            while (newnum < oldnum) {
                tbl.find("tr:last").remove();
                that.operands.length -= 1;
                newnum = newnum + 1;
            }
            while (newnum > oldnum) {
                that.operands[oldnum] = new Spark.Op(oldnum);
                tbl.append(that.spark_row(oldnum, that.operands[oldnum]));
                oldnum = oldnum + 1;
            }
        } else {
            var opnum = target.data('opnum');
            if (control === 'opname') {
                that.operands[opnum].name = parseInt(target.val());
            } else if (control === 'optype') {
                var dirsel = target.data('dirs');
                // Set the new dir index to either:
                // - the index of the current dir in the new type's list, or
                // - the default dir for the new type
                var oldtype = that.operands[opnum].type;
                var olddirn = Spark.Op.Dirs[oldtype][parseInt(dirsel.val())];
                var newtype = parseInt(target.val());
                var newdirs = Spark.Op.Dirs[newtype];
                var newdir = Spark.Op.DIR_DEFAULTS[newtype];
                var idx;
                for (idx = 0; idx < newdirs.length; idx++) {
                    if (newdirs[idx] === olddirn) {
                        newdir = idx;
                        break;
                    }
                }
                // Rebuild the dir selector
                SparkCell.spark_selector(
                    'opdir', opnum, newdirs, newdir, dirsel);

                that.operands[opnum].type = newtype;
                that.operands[opnum].dir = newdir;
            } else if (control === 'opdir') {
                that.operands[opnum].dir = parseInt(target.val());
            } else if (control === 'opio') {
                that.operands[opnum].io = parseInt(target.val());
            }
        }
        IPython.notebook.set_dirty(true);

        that.spark_refresh();
    };

    SparkCell.prototype.spark_refresh = function() {
        if (!(this.spark_validate())) {
            return;
        }
        this.spark_generate();
    };

    SparkCell.prototype.spark_validate = function() {
        var hasoutput = false;
        var haspart = false;
        for (idx = 0; idx < this.operands.length; idx++) {
            if (this.operands[idx].io == Spark.Op.IO_INOUT) {
                hasoutput = true;
            }
            if (this.operands[idx].dir > 0) {
                haspart = true;
            }
        }

        var errmsg = this.element.find("div.spark_error");
        errmsg.empty();
        if (!hasoutput) {
            errmsg.append("There must be an output operand<br>");
        }
        if (!haspart) {
            errmsg.append("There must be a partitioned operand");
        }

        return hasoutput && haspart;
    };

    SparkCell.prototype.spark_generate = function () {
        var outputcell = IPython.notebook.get_next_cell(this);
        if (!(outputcell instanceof IPython.CodeCell)) { return; }

        var that = this;
        var cm = outputcell.code_mirror;

        // What goes between sections if not altered by the user.
        var updates = ["", "\n\n", "\n\n", "\n\n", "\n\n", "\n\n", "\n\n",
                       this.pyspark.update(),
                       "\n\n", "\n"];

        // Records which phases were present before this generation.
        var phases = [false, false, false, false, false,
                      false, false, false, false, false];

        // Process the current marks.
        if (this.marks.length > 0) {
            var idx;
            var prevpos = {line:0, ch:0};
            var nextpos;
            for (idx = 0; idx <= this.marks.length; idx++) {
                prevpos = (idx != 0)
                    ? this.marks[idx-1].mk.find().to
                    : {line:0, ch:0};
                nextpos = (idx != this.marks.length)
                    ? this.marks[idx].mk.find().from
                    : {line:cm.lastLine()+1, ch:0};
                var updated = cm.getRange(prevpos, nextpos);
                var pidx = (idx == this.marks.length)
                    ? Spark.PHASE_FINAL + 1
                    : this.marks[idx].phase;
                updates[pidx] = updated;
                phases[pidx] = true;
            }
        }
        this.marks = [];

        var pos = {line:0, ch:0};

        var sink = function(phase, text) {
            if (phase === Spark.PHASE_HEADER) {
                cm.setValue("");
            }

            var uptext = updates[phase];
            if (text === "") {
                if (phases[phase] && (updates[phase].trim() != "")) {
                    // A section has been removed, and there was user text
                    // above it.
                    // TODO: remove one newline from next phase's update
                } else {
                    uptext = "";
                }
            }
            if (uptext != "") {
                cm.replaceRange(uptext, pos);
                pos.line = cm.lastLine();
            }

            if (text !== "") {
                cm.replaceRange(text, pos);
                that.marks.push({phase: phase,
                                 mk: cm.markText(pos,
                                                 {line:cm.lastLine()+1, ch:0},
                                                 {readOnly: true,
                                                  inclusiveLeft: false,
                                                  inclusiveRight: false})});
                pos.line = cm.lastLine()+1;
            }

            if (phase === Spark.PHASE_FINAL) {
                cm.replaceRange(updates[phase+1], pos);
                pos.line = cm.lastLine()+1;
            }

            return;
        };

        this.pyspark.generate(this.sig, this.operands, sink);
    };

    // Parse the spark cell contents to get the function name.
    SparkCell.prototype.set_sig = function () {
        var text = this.get_text();
        var specs = text.trim().split(/\s+/)
        if (specs.length < 3 || specs.length > 4) {
            return "Function spec: wrong number of items";
        }

        var fname = specs[0];

        if (!(fname.match(/^[^\d\W]\w*$/))) {
            return "Invalid function name";
        }

        var ftype = specs[1];
        if (ftype === "unblocked") {
            ftype = "unb";
        } else if (ftype === "blocked") {
            ftype = "blk";
        } else if (ftype === "recursive") {
            ftype = "rec";
        } else {
            return "Type must be one of unblocked, blocked, or recursive";
        }

        var fvar = specs[2];
        if (fvar === "none") {
            fvar = "";
        } else {
            var vnum = parseInt(fvar, 10)
            if (isNaN(vnum) ||
                parseFloat(fvar, 10) != vnum ||
                vnum < 1 || vnum > 20) {
                return "Variant must be none or a number from 1 to 20";
            }
            fvar = "_var"+fvar;
        }

        var fargs = "()";
        if (specs.length === 4) {
            var xargs = specs[3].split(",");
            fargs = "(" + xargs.join(", ") + ")";
        }

        this.sig = {name: fname+"_"+ftype+fvar,
                    type: ftype,
                    exargs: fargs}
        return null;
    };

    SparkCell.prototype.toJSON = function() {
        data = IPython.TextCell.prototype.toJSON.apply(this);
        data.operands = this.operands;
        var deadmarks = new Array(this.marks.length);
        var idx;
        for (idx = 0; idx < this.marks.length; idx++) {
            var mark = this.marks[idx];
            deadmarks[idx] = {
                phase: mark.phase,
                from: mark.mk.find().from,
                to: mark.mk.find().to
            };
        }
        data.deadmarks = deadmarks;
        return data;
    };

    SparkCell.prototype.fromJSON = function (data) {
        var idx;
        this.operands = new Array(data.operands.length);
        for (idx = 0; idx < data.operands.length; idx++) {
            this.operands[idx] = new Spark.Op(0).from(data.operands[idx]);
        }
        this.deadmarks = data.deadmarks;
        IPython.TextCell.prototype.fromJSON.apply(this,arguments);
    };

    SparkCell.prototype.at_top = function() {
        return false;
    };

    SparkCell.prototype.at_bottom = function() {
        return false;
    };

    IPython.SparkCell = SparkCell;


    // Teach the notebook how to insert a spark cell
    IPython.Notebook.prototype.insert_cell_at_index = function(type, index){

        var ncells = this.ncells();
        var index = Math.min(index,ncells);
            index = Math.max(index,0);
        var cell = null;

        if (ncells === 0 || this.is_valid_cell_index(index) || index === ncells) {
            if (type === 'code') {
                cell = new IPython.CodeCell(this.kernel);
                cell.set_input_prompt();
            } else if (type === 'markdown') {
                cell = new IPython.MarkdownCell();
            } else if (type === 'raw') {
                cell = new IPython.RawCell();
            } else if (type === 'heading') {
                cell = new IPython.HeadingCell();
            } else if (type === 'spark') {
                cell = new IPython.SparkCell();
            }

            if(this._insert_element_at_index(cell.element,index)){
                cell.render();
                this.select(this.find_cell_index(cell));
                $([IPython.events]).trigger('create.Cell',
                                            {'cell': cell, 'index': index});
                this.set_dirty(true);
            }
        }
        return cell;

    };

    // Teach the notebook how to turn a cell into a spark cell
    IPython.Notebook.prototype.to_spark = function(index){
        var i = this.index_or_selected(index);
        if (this.is_valid_cell_index(i)) {
            var source_element = this.get_cell_element(i);
            var source_cell = source_element.data("cell");
            if (!(source_cell instanceof IPython.SparkCell)) {
                var target_cell = this.insert_cell_below('spark',i);
                var text = source_cell.get_text();
                if (text === source_cell.placeholder) {
                    text = '';
                };
                // The edit must come before the set_text.
                target_cell.edit();
                target_cell.set_text(text);
                // make this value the starting point, so that we can only undo
                // to this state, instead of a blank cell
                target_cell.code_mirror.clearHistory();
                source_element.remove();
                this.set_dirty(true);
            };
        };
    };

    // Teach the toolbar cell selector about the spark cell type
    var selector = $("#cell_type");
    selector.change(function () {
        var cell_type = $(this).val();
        if (cell_type === 'code') {
            IPython.notebook.to_code();
        } else if (cell_type === 'markdown')  {
            IPython.notebook.to_markdown();
        } else if (cell_type === 'raw')  {
            IPython.notebook.to_raw();
        } else if (cell_type === 'heading1')  {
            IPython.notebook.to_heading(undefined, 1);
        } else if (cell_type === 'heading2')  {
            IPython.notebook.to_heading(undefined, 2);
        } else if (cell_type === 'heading3')  {
            IPython.notebook.to_heading(undefined, 3);
        } else if (cell_type === 'heading4')  {
            IPython.notebook.to_heading(undefined, 4);
        } else if (cell_type === 'heading5')  {
            IPython.notebook.to_heading(undefined, 5);
        } else if (cell_type === 'heading6')  {
            IPython.notebook.to_heading(undefined, 6);
        } else if (cell_type === 'spark') {
            IPython.notebook.to_spark();
        }
    });
    if (selector.find("#sparktype").length === 0) {
        selector.append($("<option id='sparktype'/>").attr('value','spark').text('Spark'));
    }
}

function em_restore_marks() {
    var nb = IPython.notebook;
    var spkelems = nb.get_cell_elements().toArray();
    var idx;
    for (idx = 0; idx < spkelems.length; idx++) {
        var cell = $(spkelems[idx]).data("cell");
        if (!(cell instanceof IPython.SparkCell)) {
            continue;
        }
        var code = IPython.notebook.get_next_cell(cell);
        if (!(code instanceof IPython.CodeCell)) {
            continue;
        }
        var cm = code.code_mirror;
        cell.marks = new Array(cell.deadmarks.length);
        var jdx;
        for (jdx = 0; jdx < cell.deadmarks.length; jdx++) {
            var dead = cell.deadmarks[jdx];
            cell.marks[jdx] = {phase: dead.phase,
                               mk: cm.markText(dead.from, dead.to,
                                          {readOnly: true,
                                           inclusiveLeft: false,
                                           inclusiveRight: false})};
        }
    }
}

var Spark = (function(Spark) {
    var Op = function(nameidx) {
        this.name = nameidx;
        this.type = Op.DEFAULT;
        this.dir = Op.DIR_DEFAULTS[Op.DEFAULT],
        this.io = Op.IO_DEFAULT;
    }

    Op.Types = ['scalar', 'vector', 'matrix'];
    Op.SCAL = 0;
    Op.VEC = 1;
    Op.MAT = 2;
    Op.DEFAULT = Op.MAT;

    Op.Names = [
        ['alpha','beta','gamma','delta','epsilon','phi','chi',
         'eta','lambda','mu','nu','pi','chi','rho','sigma',
         'tau','upsilon','nu','omega','chi','psi','zeta'],
        ['a','b','c','d','e','f','g','h','l','m','n',
         'p','q','r','s','t','u','v','w','x','y','z'],
        ['A','B','C','D','E','F','G','H','L','M','N',
         'P','Q','R','S','T','U','V','W','X','Y','Z']
    ];

    Op.Dirs = [
        ['none'],
        ['none', 'L->R', 'R->L', 'T->B', 'B->T'],
        ['none', 'TL->BR', 'BR->TL', 'TR->BL', 'BL->TR',
         'L->R', 'R->L', 'T->B', 'B->T']
    ];
    Op.DIR_NONE = 0;
    Op.DIR_DEFAULTS = [0, 1, 1];

    Op.Ios = ['input', 'temporary', 'input/output'];
    Op.IO_IN = 0;
    Op.IO_TEMP = 1;
    Op.IO_INOUT = 2;
    Op.IO_DEFAULT = Op.IO_INOUT;

    Op.prototype.from = function(obj) {
        this.name = obj.name;
        this.type = obj.type;
        this.dir = obj.dir;
        this.io = obj.io;
        return this;
    }

    Op.prototype.is_matrix = function() {
        return this.type === Op.MAT;
    };

    Op.prototype.is_vector = function() {
        return this.type === Op.VEC;
    }

    Op.prototype.is_transpose = function() {
        return this.is_vector() && (this.dir === 1 || this.dir === 2);
    };

    Op.prototype.is_horizontal = function() {
        return this.is_transpose() ||
            (this.is_matrix() && (this.dir === 5 || this.dir === 6));
    };

    Op.prototype.is_vertical = function() {
        return (this.is_vector() && this.dir > 2) ||
            (this.is_matrix() && this.dir > 6);
    };

    Op.prototype.is_diagonal = function() {
        return this.is_matrix() && (this.dir > 0 && this.dir < 5);
    };

    var Spark = function() {
        // Subclasses must set this to something useful
        // (See PySpark's constructor)
        this.parttags = []; this.reparttags = [];
    };

    Spark.PHASE_HEADER = 0;
    Spark.PHASE_SIGNATURE = 1;
    Spark.PHASE_LOCALS = 2;
    Spark.PHASE_PARTITION = 3;
    Spark.PHASE_GUARD = 4;
    Spark.PHASE_BLOCK = 5;
    Spark.PHASE_REPART = 6;
    Spark.PHASE_CONTINUE = 7;
    Spark.PHASE_OUTPUT = 8;
    Spark.PHASE_FINAL = Spark.PHASE_OUTPUT;

    // Which partition component to use in the guard.
    Spark.GPIDX = [
        [],
        [-1, 0, 1, 0, 1],
        [-1, 0, 3, 1, 2, 0, 1, 0, 1]
    ];
    // Which partition component to use in the block size.
    Spark.BPIDX = [
        [],
        [-1, 1, 0, 1, 0],
        [-1, 3, 1, 2, 0, 1, 0, 1, 0]
    ];

    Spark.prototype.generate = function(sig, operands, sink) {
        var idx;

        var varnames = new Array(operands.length);
        var allpartnames = new Array(operands.length);
        var allpartargs = new Array(operands.length);
        var allrepartnames = new Array(operands.length);
        var allrepartargs = new Array(operands.length);
        for (idx = 0; idx < operands.length; idx++) {
            varnames[idx] = this.varname(operands[idx])
            allpartnames[idx] = this.partnames(operands[idx]);
            allpartargs[idx] = this.partargs(null, operands[idx]);
            allrepartnames[idx] = this.repartnames(sig.type, operands[idx]);
            allrepartargs[idx] = this.partargs(sig.type, operands[idx]);
        }

        var that = this;
        var partgroup = function(i, op) {
            return that.op_partition(op, varnames[i], allpartnames[i],
                                     allpartargs[i]);
        };
        var repartgroup = function(i, op) {
            return that.op_repartition(op, allpartnames[i], allrepartnames[i],
                                       allrepartargs[i]);
        };
        var contgroup = function(i, op) {
            return that.op_cont(op, allpartnames[i], allrepartnames[i],
                                that.parttags[op.type][op.dir])
        };

        var firstpart = -1;
        for (idx = 0; idx < operands.length; idx++) {
            if (operands[idx].dir !== Spark.Op.DIR_NONE) {
                firstpart = idx;
                break;
            }
        }

        sink(Spark.PHASE_HEADER, this.header(sig));
        sink(Spark.PHASE_SIGNATURE, this.signature(sig, operands, varnames));
        sink(Spark.PHASE_LOCALS, this.locals(sig, operands, allpartnames,
                                             allrepartnames));
        sink(Spark.PHASE_PARTITION, this.group(partgroup, operands));
        sink(Spark.PHASE_GUARD, this.guard(operands[firstpart],
                                           allpartnames[firstpart],
                                           varnames[firstpart]));
        var blocktext = (sig.type === 'unb')
            ? ""
            : this.blocksize(operands[firstpart], allpartnames[firstpart]);
        sink(Spark.PHASE_BLOCK, blocktext);
        sink(Spark.PHASE_REPART, this.group(repartgroup, operands));
        sink(Spark.PHASE_CONTINUE, this.group(contgroup, operands));
        sink(Spark.PHASE_OUTPUT, this.output(sig, operands, allpartnames,
                                             allrepartnames, varnames));
    };

    // The identifier used in the function signature.
    Spark.prototype.varname = function(op) {
        var name = Spark.Op.Names[op.type][op.name];
        if (op.is_transpose()) { name += "t"; }
        return name;
    };

    // Array of identifiers written into by partitioning.
    Spark.prototype.partnames = function(op) {
        if (op.dir == Spark.Op.DIR_NONE) { return [];}

        var names;
        var basename = Spark.Op.Names[op.type][op.name];
        if (op.is_horizontal()) {
            names = [basename+"L", basename+"R"];
            if (op.is_transpose()) {
                names = [names[0]+"t", names[1]+"t"];
            }
        } else if (op.is_vertical()) {
            names = [basename+"T", basename+"B"];
        } else {
            names = [basename+"TL", basename+"TR",
                     basename+"BL", basename+"BR"];
        }
        return names;
    };

    // The trailing arguments to 'flame_part_xxx', as a string.
    // Call with null ftype for partition, actual ftype for repartition.
    Spark.prototype.partargs = function(ftype, op) {
        if (op.dir === Spark.Op.DIR_NONE) { return ""; }

        var args;
        var arg;
        var tags;
        if (ftype) {
            arg = (ftype === 'blk') ? "block_size" : "1";
            tags = this.reparttags;
        } else {
            tags = this.parttags;
            arg = "0";
        }
        if (op.is_diagonal()) {
            args = [arg, arg, tags[op.type][op.dir]];
        } else {
            args = [arg, tags[op.type][op.dir]];
        }
        return args.join(", ");
    };

    // Array of identifiers written into by repartitioning.
    Spark.prototype.repartnames = function(ftype, op) {
        if (op.dir === Spark.Op.DIR_NONE) { return []; }

        // For sub-components that are the same type as
        // the main component.
        var basetype = (op.is_diagonal() || (op.is_matrix() && ftype !== 'rec'))
            ? Spark.Op.MAT : Spark.Op.VEC;

        // For sub-components that may have dimension 1 less than
        // the main component.
        var slicetype = Spark.Op.MAT;
        if ((op.is_matrix() && ftype === 'unb') ||
            (op.is_vector() && ftype === 'blk')) {
            slicetype = Spark.Op.VEC;
        } else if ((op.is_vector() && ftype === 'unb') ||
                   (ftype === 'rec' && !(op.is_diagonal()))) {
            slicetype = Spark.Op.SCAL;
        }

        // For sub-components that may have dimension 2 less than
        // the main component.
        var dicetype = (ftype === 'unb') ? Spark.Op.SCAL : Spark.Op.MAT;

        var basename = Spark.Op.Names[basetype][op.name];
        var slicename = Spark.Op.Names[slicetype][op.name];
        var dicename = Spark.Op.Names[dicetype][op.name];
        var names;
        if (op.is_diagonal()) {
            names = [basename+"00", slicename+"01", basename+"02",
                     slicename+"10", dicename+"11", slicename+"12",
                     basename+"20", slicename+"21", basename+"22"];
            if (ftype === 'unb') {
                names[3] += "t"; names[5] += "t";
            }
        } else {
            names = [basename+"0", slicename+"1", basename+"2"];
            if (op.is_vector() && op.is_horizontal() && ftype !== 'rec') {
                names[0] += "t"; names[2] += "t";
            }
            if (op.is_vector() && op.is_horizontal() && ftype === 'blk') {
                names[1] += "t";
            }
            if (op.is_matrix() && op.is_vertical() && ftype === 'unb') {
                names[1] += "t";
            }
        }

        return names;
    };

    Spark.prototype.group = function(f, ops) {
        var result = "";
        var idx;
        for (idx = 0; idx < ops.length; idx++) {
            var tmp = f(idx, ops[idx]);
            if (tmp) {
                result += tmp;
                if (idx < (ops.length-1)) {
                    result += "\n\n";
                }
            }
        }
        return result;
    }

    Spark.prototype.guard = function(op, pnames, vname) {
        var i = (op.is_horizontal()) ? "1" : "0";
        var pname = pnames[Spark.GPIDX[op.type][op.dir]];
        return this.op_guard(i, pname, vname);
    };

    Spark.prototype.blocksize = function(op, pnames) {
        var i = (op.is_horizontal()) ? "1" : "0";
        var pname = pnames[Spark.BPIDX[op.type][op.dir]];
        return this.op_blocksize(i, pname);
    };

    // Override in subclasses.
    Spark.prototype.header = function(sig) { return ""; };
    Spark.prototype.signature = function(sig, ops, vnames) { return ""; };
    Spark.prototype.locals = function(sig, ops, pnames, rnames) { return ""; };
    Spark.prototype.update = function() { return ""; };
    Spark.prototype.output = function(sig, ops, allps, allrs, vnames) {
        return "";
    };

    Spark.prototype.op_guard = function(i, pname, vname) { return null; };
    Spark.prototype.op_blocksize = function(i, pname) { return null; };
    Spark.prototype.op_partition = function(op, vname, pnames, pargs) {
        return null;
    };
    Spark.prototype.op_repartition = function(op, pnames, pargs) {
        return null;
    };
    Spark.prototype.op_cont = function(op, pnames, rnames, ptag) {
        return null;
    };


    Spark.Op = Op;

    return Spark;
}(Spark));

var Spark = (function(Spark) {
    var PySpark = function() {
        this.parttags = [
            [],
            [null, "'LEFT'", "'RIGHT'", "'TOP'", "'BOTTOM'"],
            [null, "'TL'", "'BR'", "'TR'", "'BL'",
             "'LEFT'", "'RIGHT'", "'TOP'", "'BOTTOM'"]
        ];
        this.reparttags = [
            [],
            [null, "'RIGHT'", "'LEFT'", "'BOTTOM'", "'TOP'"],
            [null, "'BR'", "'TL'", "'BL'", "'TR'",
             "'RIGHT'", "'LEFT'", "'BOTTOM'", "'TOP'"]
        ];
    };

    PySpark.prototype = new Spark();

    PySpark.prototype.header = function(sig) {
        return "import flame\nimport laff as laff";
    };

    PySpark.prototype.signature = function(sig, operands, varnames) {
        var def = "def " + sig.name + "(";
        var idx;
        for (idx = 0; idx < operands.length; idx++) {
            if (operands[idx].io !== Spark.Op.IO_TEMP) {
                def += varnames[idx];
                if (idx < (operands.length-1)) {
                    def += ", ";
                }
            }
        }
        if (sig.type === 'blk' || sig.type === 'rec') {
            def += ", nb_alg";
        }
        def += "):";
        return def;
    };

    PySpark.prototype.op_guard = function(i, pname, vname) {
        return "    while "+pname+".shape["+i+"] < "+vname+".shape["+i+"]:";
    };

    PySpark.prototype.op_blocksize = function(i, pname) {
        return "        block_size = min("+pname+".shape["+i+"], nb_alg)";
    };

    PySpark.prototype.op_partition = function(op, vname, pnames, pargs) {
        if (op.dir === Spark.Op.DIR_NONE) { return null; }

        var result = "";
        var ipos = 0;
        result += "    " + pnames[0] + ", ";
        if (op.is_vertical()) {
            result += "\\";
            ipos = result.length;
            result += "\n    ";
        }
        result += pnames[1];
        if (op.is_vertical()) {
            result += " ";
        }
        if (op.is_diagonal()) {
            result += ", \\";
            ipos = result.length;
            result += "\n    " + pnames[2] + ", " + pnames[3] + " ";
        }
        result += " = flame.part_";
        if (op.is_diagonal()) {
            result += "2x2";
        } else if (op.is_vertical()) {
            result += "2x1";
        } else {
            result += "1x2";
        }
        ipos = result.length - ipos;
        result += "(" + vname + ", \\\n";
        if (op.is_horizontal()) { result += " "; }
        result += (Array(ipos+1).join(" ")) + pargs + ")";

        return result;
    };

    PySpark.prototype.op_repartition = function(op, pnames, rnames, pargs) {
        if (op.dir === Spark.Op.DIR_NONE) { return null; }

        var tabspace = function(i, j) {
            var len = rnames[i].length - rnames[j].length;
            return Array(len+1).join(" ");
        };

        var ipos = 0;
        var indent = "        ";
        var result = "";
        if (op.is_diagonal()) {
            result += indent + rnames[0] + ", " + tabspace(3, 0) +
                rnames[1] + ", " + tabspace(4, 1) +
                rnames[2] + ", " + tabspace(5, 2) + "\\\n";
            result += indent + rnames[3] + ", " + rnames[4] + ", " +
                rnames[5] + ", \\";
            ipos = result.length;
            result += "\n";
            result += indent + rnames[6] + ", " + tabspace(3, 6) +
                rnames[7] + ", " + tabspace(4, 7) +
                rnames[8] + "  " + tabspace(5, 8);
        } else if (op.is_vertical()) {
            result += indent + rnames[0] + ", " + tabspace(1, 0) + "\\\n";
            result += indent + rnames[1] + ", \\";
            ipos = result.length;
            result += "\n";
            result += indent + rnames[2] + "  " + tabspace(1, 2);
        } else if (op.is_horizontal()) {
            result += indent + rnames[0] + ", " + rnames[1] + ", " +
                rnames[2] + " ";
        }
        result += "= flame.repart_";
        if (op.is_vertical()) {
            result += "2x1_to_3x1";
        } else if (op.is_horizontal()) {
            result += "1x2_to_1x3";
        } else if (op.is_diagonal()) {
            result += "2x2_to_3x3";
        }
        ipos = result.length - ipos;
        var alignspace = Array(ipos+1).join(" ");
        result += "(";
        if (op.is_vertical()) {
            result += pnames[0] + ", \\\n" + alignspace +
                pnames[1] + ", \\\n";
        } else if (op.is_horizontal()) {
            result += pnames[0] + ", " + pnames[1] + ", \\\n ";
        } else if (op.is_diagonal()) {
            result += pnames[0] + ", " + pnames[1] + ", \\\n" + alignspace +
                pnames[2] + ", " + pnames[3] + ", \\\n";
        }
        result += alignspace + pargs + ")";

        return result;
    };

    PySpark.prototype.update = function() {
        return "\n\n\
        #------------------------------------------------------------#\n\
\n\
        #                       update line 1                        #\n\
        #                             :                              #\n\
        #                       update line n                        #\n\
\n\
        #------------------------------------------------------------#\n\
\n";
    };

    PySpark.prototype.op_cont = function(op, pnames, rnames, ptag) {
        if (op.dir === Spark.Op.DIR_NONE) { return null; }

        var tabspace = function(i, j) {
            var len = rnames[i].length - rnames[j].length;
            return Array(len+1).join(" ");
        };

        var ipos = 0;
        var indent = "        ";
        var result = "";
        if (op.is_diagonal()) {
            result += indent + pnames[0] + ", " + pnames[1] + ", \\";
            ipos = result.length;
            result += "\n";
            result += indent + pnames[2] + ", " + pnames[3] + "  ";
        } else if (op.is_vertical()) {
            result += indent + pnames[0] + ", \\";
            ipos = result.length;
            result += "\n";
            result += indent + pnames[1] + "  ";
        } else if (op.is_horizontal()) {
            result += indent + pnames[0] + ", " + pnames[1] + " ";
        }
        result += "= flame.cont_with_";
        if (op.is_vertical()) {
            result += "3x1_to_2x1";
        } else if (op.is_horizontal()) {
            result += "1x3_to_1x2";
        } else if (op.is_diagonal()) {
            result += "3x3_to_2x2";
        }
        ipos = result.length - ipos;
        var alignspace = Array(ipos+1).join(" ");
        result += "(";

        if (op.is_diagonal()) {
            result += rnames[0] + ", " + tabspace(3, 0) +
                rnames[1] + ", " + tabspace(4, 1) +
                rnames[2] + ", " + tabspace(5, 2) + "\\\n";
            result += alignspace;
            result += rnames[3]+", "+rnames[4]+", "+rnames[5]+", \\\n";
            result += alignspace;
            result += rnames[6] + ", " + tabspace(3, 6) +
                rnames[7] + ", " + tabspace(4, 7) +
                rnames[8] + ", " + tabspace(5, 8) + "\\\n";
        } else if (op.is_vertical()) {
            result += rnames[0] + ", " + tabspace(1, 0) + "\\\n" +
                alignspace + rnames[1] + ", \\\n" +
                alignspace + rnames[2] + ", " + tabspace(1, 2) + "\\\n";
        } else if (op.is_horizontal()) {
            result += rnames[0]+", "+rnames[1]+", "+rnames[2]+", \\\n ";
        }
        result += alignspace + ptag + ")";

        return result;
    };

    PySpark.prototype.output = function(sig, ops, allps, allrs, vnames) {
        var that = this;
        var opgroup = function(i, op) {
            return that.op_output(sig, op, allps[i], allrs[i], vnames[i]);
        };
        return this.group(opgroup, ops);
    };

    PySpark.prototype.op_output = function(sig, op, pnames, rnames, vname) {
        if (op.io !== Spark.Op.IO_INOUT) { return null; }
        if (op.dir === Spark.Op.DIR_NONE) { return null; }

        var ipos = 0;
        var result = "    flame.merge_";
        if (op.is_horizontal()) {
            result += "1x2(";
            result += pnames[0] + ", " + pnames[1] + ", "
        } else if (op.is_vertical()) {
            result += "2x1(";
            ipos = result.length;
            result += pnames[0] + ", \\\n" +
                Array(ipos+1).join(" ") + pnames[1] + ", "
        } else if (op.is_diagonal()) {
            result += "2x2(";
            ipos = result.length;
            result += pnames[0] + ", " + pnames[1] + ", \\\n" +
                Array(ipos+1).join(" ") + pnames[2] + ", " + pnames[3] + ", ";
        }
        result += vname + ")";
        return result;
    };

    Spark.PySpark = PySpark;

    return Spark;
}(Spark));
