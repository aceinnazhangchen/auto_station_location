const ftp = require('ftp');//FTP
const path = require('path');
const client = new ftp();
const fs = require('fs');
const dataCfg = require("./dataCfg.json");

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawnSync = require('child_process').spawnSync;

const daysec = 86400;

const address = {
    host : '198.118.242.40',
    port : '21',
    user : 'anonymous',
    password : '',
    keepalive : 1000
}

client.on('close',()=>{
    console.log('ftp client has close')
});

client.on('error',(err)=>{
    console.log('ftp client has an error : '+ JSON.stringify(err))
});

async function connectFtp()
{
    return new Promise((resolve,reject)=>{
        client.connect(address);
        client.on('ready',(err)=>{
            console.log('ftp client is ready');
            resolve({err : err})
        });
    });
}

async function endFtp()
{
    return new Promise((resolve,reject)=>{
        client.end();
        client.on('end',(err)=>{
            console.log('ftp client has end');
            resolve({err : err})
        });
    });
}


//show list
async function list(dirpath){
    let {err : ea,dir } = await cwd(dirpath);
    return new Promise((resolve,reject)=>{
        client.list((err,files)=>{
            resolve({err : err,files : files})
        })
    });
}
//change path
function cwd(dirpath){
    return new Promise((resolve,reject)=>{
        client.cwd(dirpath,(err,dir)=>{
            resolve({err : err,dir : dir});
        })
    });
}
//download
async function get(filePath,localPath){
    const dirpath = path.dirname(filePath);
    const fileName =path.basename(filePath);
    const localfile = path.join(localPath,fileName);
    let {err : ea,dir} = await cwd(dirpath);
    return new Promise((resolve,reject)=>{
        client.get(fileName,(err,rs)=>{
            console.log('download '+filePath+' start');
            if(err)
            {
                console.log(err.message);
                resolve({err : err});
            }
            else
            {
                rs.once('close',()=>{
                    console.log('download '+filePath+' success');
                    resolve({err : err});
                });
                rs.pipe(fs.createWriteStream(localfile));
            }                
        });
    });
}
//upload
async function put(currentFile,targetFilePath){
    const dirpath = path.dirname(targetFilePath);
    const fileName = path.basename(targetFilePath);
    const rs = fs.createReadStream(currentFile);
    let {err : ea,dir} = await cwd(dirpath);
    if(ea){
        return Promise.resolve({err : ea});
    }
    return new Promise((resolve,reject)=>{
        client.put(rs,fileName,(err)=>{
            resolve({err : err});
        })
    });
}

const gpst0=[1980,1,6,0,0,0];

function epoch2time(ep)
{
    const doy = [1,32,60,91,121,152,182,213,244,274,305,335];
    var time0 = 0;
    const year=ep[0],mon=ep[1],day=ep[2];
    if (year<1970||2099<year||mon<1||12<mon) return time0;
	
    const days=(year-1970)*365+Math.floor((year-1969)/4)+doy[mon-1]+day-2+(year%4==0&&mon>=3?1:0);
    time0=days*daysec+ep[3]*3600+ep[4]*60+ep[5];
    return time0;
}

function time2gpst(time)
{
    const time0 = epoch2time(gpst0);
    const sec = time - time0;
    const week = Math.floor(sec/(daysec*7));
    return week;
}
 
//async
function mkdirs(dirname, callback) {  
    fs.exists(dirname, function (exists) {  
        if (exists) {  
            callback();  
        } else {  
            // console.log(path.dirname(dirname));  
            mkdirs(path.dirname(dirname), function () {  
                fs.mkdir(dirname, callback);  
                console.log('at ' + path.dirname(dirname) + ' make ' + dirname );
            });  
        }  
    });  
}

//sync
function mkdirsSync(dirname) {
    if (fs.existsSync(dirname)) {
      return true;
    } else {
      if (mkdirsSync(path.dirname(dirname))) {
        fs.mkdirSync(dirname);
        return true;
      }
    }
  }

async function download (ftpPathArr,downloadPath){
    //download
    for(let i = 0;i < ftpPathArr.length;i++)
    {
        let {err : ea} = await get(ftpPathArr[i],downloadPath);
        if(ea){
            console.log(ea);
            continue;
        }
    }
}

function numberLeftCompleting(bits, identifier, value){
    value = Array(bits + 1).join(identifier) + value;
    return value.slice(-bits);
}

async function unzip(filename)
{
    const { stdout, stderr } = await exec(`gzip -vfd ${filename}`).catch((error)=>{
        console.error(error);
    });
    if(stdout)
    {
        console.log('stdout:', stdout);
    }
    if(stderr)
    {
        console.error('stderr:', stderr);
    }
}

function runTools(downloadPath,rtcmePath,obsfile,brdcFile,sp3hFile,clkFile,datetime,outPath)
{	
    if(fs.existsSync(path.join(rtcmePath,obsfile+'.rtcm')) == false)
    {
		console.log(path.join(rtcmePath,obsfile+'.rtcm')," is not exists");
		return;
	}
	if(fs.existsSync(path.join(outPath,obsfile+'.pos')))
	{
		console.log(path.join(outPath,obsfile+'.pos')," is exists");
		return;
	}
	console.log("/bin/convbin");
	spawnSync(path.join(__dirname,"/bin/convbin"),
	['-tr',datetime,'-r','rtcm3',
	path.join(rtcmePath,obsfile+'.rtcm'),
	'-d',downloadPath],
	{stdio: 'inherit'});

	console.log("sed");
	let obsPath = path.join(downloadPath,obsfile+'.obs');
	spawnSync('sed',['-i','/ANT # /{ s?.*?8848                JAV_GRANT-G3T                           ANT # / TYPE?}',obsPath]);
		
	console.log("/bin/rnx2rtkp");
	spawnSync(path.join(__dirname,"/bin/rnx2rtkp"),
	['-k',path.join(__dirname,'opst.conf'),'-ti','30',
	obsPath,
	path.join(downloadPath,brdcFile),
	path.join(downloadPath,sp3hFile),
	path.join(downloadPath,clkFile),
	'-o',
	path.join(outPath,obsfile+'.pos')],
	{stdio: 'inherit'});
	
	console.log("rm");
	spawnSync("rm",["-f",obsPath]);

	console.log("tail");
	const {stdout} = spawnSync("tail",["-1",path.join(outPath,obsfile+'.pos')]);
	console.log(stdout.toString());
	return stdout.toString();
}

function readLastUpdate()
{
    if(fs.existsSync(path.join(__dirname,"lastUpdate.json")) == false)
    {
        return null;
    }
    const buffer = fs.readFileSync(path.join(__dirname,"lastUpdate.json"));

    const data = JSON.parse(buffer.toString());

    return data.date;
}

async function run()
{
    const lastdate = readLastUpdate();
    var date;
    if(lastdate)
    {
        date = new Date(new Date(lastdate).getTime() + (daysec+60)*1000);
    }
    else{
        date = new Date(new Date().getTime() - (3*daysec*1000));
    }
    console.log(date.toLocaleDateString(),date.getTime()/1000);
    const fullyear = date.getFullYear().toString();
    const month = date.getMonth()+1;
    const day = date.getDate();
    const year = fullyear.substr(-2);
    const hasTimestamp = date - new Date(fullyear);
    const hasDays = Math.ceil(hasTimestamp / (daysec*1000));
    const doy = numberLeftCompleting(3,"0",hasDays);
    const weekDay = date.getDay().toString();
    const gpsWeekNum = time2gpst(date.getTime()/1000);
	console.log(doy);
    const downloadPath = path.join(__dirname,"download",fullyear,doy);
    console.log(gpsWeekNum);

    const brdcFile = "BRDC00IGS_R_"+fullyear+doy+"0000_01D_MN.rnx";
    const brdcFileZ = brdcFile+".gz";
    const ftpBrdcPath = path.join("/pub/gps/data/daily/",fullyear,doy,year+"p",brdcFileZ); 
    
    // const sp3hFile = "GFZ0MGXRAP_"+fullyear+doy+"0000_01D_05M_ORB.SP3";
    // const sp3hFileZ = sp3hFile+".gz";
    // const ftpSp3hPath = path.join("/pub/gps/products/mgex/",gpsWeekNum.toString(),sp3hFileZ);
    // const clkFile = "GFZ0MGXRAP_"+fullyear+doy+"0000_01D_30S_CLK.CLK";
    // const clkFileZ = clkFile+".gz";
    // const ftpClkPath = path.join("/pub/gps/products/mgex/",gpsWeekNum.toString(),clkFileZ);

    const sp3hFile = "igr"+gpsWeekNum+weekDay+".sp3";
    const sp3hFileZ = sp3hFile+".Z";
    const ftpSp3hPath = path.join("/pub/gps/products/",gpsWeekNum.toString(),sp3hFileZ);

    const clkFile = "igr"+gpsWeekNum+weekDay+".clk";
    const clkFileZ = clkFile+".Z";
    const ftpClkPath = path.join("/pub/gps/products/",gpsWeekNum.toString(),clkFileZ);

    const rtcmBasePath = dataCfg.rtcmPath;
    const rtcmePath = path.join(rtcmBasePath,fullyear,doy);

    mkdirsSync(downloadPath);

    sp3hFileLowCase = path.basename(sp3hFile,".SP3")+".sp3";
    clkFileLowCase = path.basename(clkFile,".CLK")+".clk";

    await connectFtp();
    // 
    //===Brdc File===
    if(fs.existsSync(path.join(downloadPath,brdcFile))==false)
    {
        let {err : ea} = await get(ftpBrdcPath,downloadPath);
        if(ea){
            console.log(ea);
            client.end();
            return;
        }
        await unzip(path.join(downloadPath,brdcFileZ));
    }
    //child_process.spawnSync('gzip',['-vd',path.join(downloadPath,brdcFileZ)]);
    //===Sp3 File===
    if(fs.existsSync(path.join(downloadPath,sp3hFileLowCase))==false)
    {
        let {err : eb} = await get(ftpSp3hPath,downloadPath);
        if(eb){
            console.log(eb);
            client.end();
            return;
        }
        await unzip(path.join(downloadPath,sp3hFileZ));
        await exec(`mv ${path.join(downloadPath,sp3hFile)}  ${path.join(downloadPath,sp3hFileLowCase)}`);
    }
    //child_process.spawnSync('gzip',['-vd',path.join(downloadPath,sp3hFileZ)]);
    //===Clk File===
    if(fs.existsSync(path.join(downloadPath,clkFileLowCase))==false)
    {
        let {err : ed} = await get(ftpClkPath,downloadPath);
        if(ed){
            console.log(ed);
            client.end();
            return;
        }
        await unzip(path.join(downloadPath,clkFileZ));
        await exec(`mv ${path.join(downloadPath,clkFile)}  ${path.join(downloadPath,clkFileLowCase)}`);
    }
    //child_process.spawnSync('gzip',['-vd',path.join(downloadPath,clkFileZ)]);
    await endFtp();

    var currentUpdate = {date:date.toLocaleDateString(),stations:[]};
 
    console.log(dataCfg.stations);
	
	const outPath = path.join(__dirname,"download",fullyear,'igr_'+doy);
	mkdirsSync(outPath);
	
    for(let i in dataCfg.stations)
    {
        let obsfile = dataCfg.stations[i]+doy+"0";
		let datetime = fullyear+"/"+month+"/"+day+" 00:00:00";
		console.log(datetime);
        let outPosStr = runTools(downloadPath,rtcmePath,obsfile,brdcFile,sp3hFileLowCase,clkFileLowCase,datetime,outPath);
		currentUpdate.stations.push(outPosStr);
    }

    fs.writeFileSync(path.join(__dirname,"lastUpdate.json"),JSON.stringify(currentUpdate, null, '\t'));
}

run();