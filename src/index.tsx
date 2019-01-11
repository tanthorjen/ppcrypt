import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Dropbox } from 'dropbox';

import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import InputBase from '@material-ui/core/InputBase';

import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContentText from '@material-ui/core/DialogContentText';
import LinearProgress from '@material-ui/core/LinearProgress';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import IconButton from '@material-ui/core/IconButton';
import Avatar from '@material-ui/core/Avatar';

import CreateNewFolderIcon from '@material-ui/icons/CreateNewFolder';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import LockIcon from '@material-ui/icons/Lock';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import FolderIcon from '@material-ui/icons/Folder';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';

import Button from '@material-ui/core/Button';


import * as EncLib from './enclib';
import { TextField } from '@material-ui/core';

interface PpFile {
  displayName: string;
  originName: string; // name in dropbox
  decrypted: EncLib.IDecryptedFilename | null;
  isFolder: boolean;
}

// The current displayed folder in the app
interface AppFolder {
  originPath: string; // path of folder in dropbox
  files: PpFile[];
}

interface AppState {
  dropbox: Dropbox;
  encryptKey: CryptoKey | null;
  
  folder: AppFolder;

  viewFile: PpFile | null;   // the file we are viewing
  viewFileUrl: string | null;    // if set, we have downloaded the file from dropbox

  progress: string | null;  // current progress if any
}

function show(comp: JSX.Element) {
  ReactDom.render(comp, document.getElementById('root'))
}

interface PpFileCallback { (e: React.MouseEvent<HTMLElement>, file: PpFile): void }

function FileView(props: {file: PpFile, fileUrl: string}): JSX.Element {

  let filename = props.file.displayName.toLowerCase()
  const style = { width: "100%" }
  if (filename.endsWith(".mp4")) {
    return (
      <video style={style} controls>
        <source src={props.fileUrl} type="video/mp4"/>
      </video>    
    )
  } else {
    return (<div>{filename}</div>)
  }
}

function FileItem(props: {file: PpFile, handler: PpFileCallback}): JSX.Element {
  const f = props.file
  if (f.decrypted) {
    return (
      <ListItem key={props.file.originName} button={true} onClick={(e) => props.handler(e,f)}>
        { f.isFolder ? 
          <ListItemIcon><FolderIcon color="secondary"/></ListItemIcon> : 
          <ListItemIcon><LockOpenIcon color="secondary"/></ListItemIcon> }      
        <ListItemText primary={f.displayName} secondary={f.originName}/>
      </ListItem>
    )
  }
  else {
    if (f.isFolder) {
      return (
        <ListItem key={props.file.originName} button={true} onClick={(e) => props.handler(e,f)}>
          <ListItemIcon><FolderIcon/></ListItemIcon>
          <ListItemText primary={f.displayName}/>
        </ListItem>
      )
    } else {
      return (
        <ListItem key={props.file.originName} button={true} onClick={(e) => props.handler(e,f)}>
          <ListItemText primary={f.displayName}/>
        </ListItem>
      )
    }
  }
}

function fileSort(a: PpFile, b: PpFile): number {
  if (a.decrypted && !b.decrypted) return -1
  if (!a.decrypted && b.decrypted) return 1
  // encryption is the same, now sort by folders
  if (a.isFolder && !b.isFolder) return -1
  if (!a.isFolder && b.isFolder) return 1
  return a.displayName.localeCompare(b.displayName)
}

function handleFileClick(e: React.MouseEvent<HTMLElement>, file: PpFile, app: AppState) {
  e.preventDefault()
  if (file.isFolder) {
    goFolder(app, app.folder.originPath + file.originName + "/")
  } else {
    goFile(app, file)
  }
}

function FileList(props: { files: PpFile[], handler: PpFileCallback }): JSX.Element {
  props.files.sort(fileSort)
  return (
    <List>
      {props.files.map((o,i) => <FileItem file={o} handler={props.handler}/>)}
    </List>
  )
}

async function setPassword(e: React.FormEvent<HTMLElement>, app: AppState) {
  e.preventDefault()    
  const newKey = await EncLib.passwordToKey(e.target['encryptPassword'].value)
  goFolder({...app, encryptKey: newKey}, app.folder.originPath)
}

function PasswordField(props: {app: AppState}): JSX.Element {
  const clearPassword = (e) => {
    e.preventDefault()
    goFolder({...props.app, encryptKey: null}, props.app.folder.originPath)
  }

  if (!props.app.encryptKey) {
    const inputStyle = {
      backgroundColor: '#93D3F1'      
    }

    return (
      <form onSubmit={(e) => setPassword(e, props.app)}>
        <InputBase style={inputStyle} name="encryptPassword" placeholder="Password" color="inherit" type="password"/>
      </form>
    )
  } else {
    return <IconButton onClick={(e) => clearPassword(e)}><LockIcon/></IconButton>
  }
}

function MessageDialog(props: { message: string }): JSX.Element {
  return (
    <Dialog open>
        <DialogTitle>{props.message}</DialogTitle>
        <DialogContent>
          <LinearProgress/>
        </DialogContent>
      </Dialog>
  )
}

function NewFolderDialog(props:{ onClose:() => void, onSubmit:(string) => void }): JSX.Element {
  const onclick = () => {
    const el = document.getElementsByName("nameInput")[0] as HTMLInputElement
    props.onSubmit(el.value)
  }

  return (
    <Dialog open onClose={e => props.onClose()}>
        <DialogTitle>New Folder</DialogTitle>
        <DialogContent>
          <TextField name="nameInput"/>
        </DialogContent>
        <DialogActions>
          <Button color="primary" onClick={e =>onclick()}>
            Create Folder
          </Button>
        </DialogActions>
      </Dialog>
  )
}

async function createFolder(folder: string, app: AppState) {
  if (folder == "") return
  if (!app.encryptKey) {
    showApp({...app, progress: "Creating folder..."})
    await app.dropbox.filesCreateFolderV2({path: app.folder.originPath + folder})    
  } else {
    const iv = EncLib.genIv()
    const dec = await EncLib.encryptFilename(app.encryptKey, iv, folder)
    await app.dropbox.filesCreateFolderV2({path: app.folder.originPath + dec})    
  }
  goFolder(app, app.folder.originPath)
}

function App(props: { app: AppState }) {
  let app = props.app

  const [showNewFolder, setShowNewFolder] = React.useState(false)

  let mainView: JSX.Element
  let backClick: (() => void) | null
  if (app.viewFile && !app.viewFileUrl) {
    mainView = <div style={ { padding: "70px 0"} } ><LinearProgress/></div>
    backClick = () => showApp({ ...app, viewFile: null })
  } else if (app.viewFile && app.viewFileUrl) {
    mainView = <FileView file={app.viewFile} fileUrl={app.viewFileUrl}/>
    backClick = () => showApp({ ...app, viewFile: null, viewFileUrl: null })
  } else {
    mainView = <FileList files={app.folder.files} handler={(e,f) => handleFileClick(e, f, app)}/>
    backClick = app.folder.originPath == "/" ? null : () => { goUpFolder(app) }
  }

  let screen = (
    <div onDragOver={(e) => e.preventDefault()} onDrop={ (e) => app.progress ? null : handleDrop(e, app) }>
      <AppBar position="static">
        <Toolbar>
          { backClick ? <IconButton><ArrowBackIcon onClick={e => backClick ? backClick() : null }/></IconButton> : null }          
          <Typography variant="h6" color="inherit">
            {app.folder ? app.folder.originPath : ""}
          </Typography>
          <IconButton onClick={(e) => setShowNewFolder(true)}><CreateNewFolderIcon/></IconButton>
          <div style={ {flexGrow:1} }/>          
          <PasswordField app={app}/>
        </Toolbar>
      </AppBar>
      { mainView }
      { showNewFolder ? 
        <NewFolderDialog onClose={() => setShowNewFolder(false)} onSubmit={(s) => {setShowNewFolder(false); createFolder(s, app)}}/> 
        : null }      
      { app.progress ? <MessageDialog message={app.progress}/> : null }
    </div>
  )
  return screen
}

function showApp(app: AppState) {
  show(<App app={app}/>)
}

async function decryptDropboxFilename(name: string, isFolder: boolean, key: CryptoKey): Promise<PpFile> {
  if (!key) {
    return { displayName: name, originName: name, decrypted: null, isFolder: isFolder }
  }

  let dec = await EncLib.decryptFilename(key, name)
  if (dec) {
    return { displayName: dec.name, originName: name, decrypted: dec, isFolder: isFolder }
  } else {
    return { displayName: name, originName: name, decrypted: null, isFolder: isFolder }
  }
}

async function fetchFolder(dbx: Dropbox, path: string, key: CryptoKey | null): Promise<AppFolder> {
  if (key) {
    var ret = await dbx.filesListFolder({path: path == '/' ? '' : path})
    var allFiles = await Promise.all(ret.entries.map((o,i) => decryptDropboxFilename(o.name, o['.tag'] == 'folder', key)))
    while (ret.has_more) {
      ret = await dbx.filesListFolderContinue({cursor: ret.cursor})
      allFiles = allFiles.concat(await Promise.all(ret.entries.map((o,i) => decryptDropboxFilename(o.name, o['.tag'] == 'folder', key))))
    }  
    return { originPath: path, files: allFiles }  
  } else {
    var ret = await dbx.filesListFolder({path: path == '/' ? '' : path})
    var allFiles = ret.entries.map((o,i) => ({ displayName: o.name, originName: o.name, decrypted: null, isFolder: o['.tag'] == 'folder' })) as PpFile[]
    while (ret.has_more) {
      ret = await dbx.filesListFolderContinue({cursor: ret.cursor})
      allFiles = allFiles.concat(ret.entries.map((o,i) => ({ displayName: o.name, originName: o.name, decrypted: null, isFolder: o['.tag'] == 'folder' })))
    }  
    return { originPath: path, files: allFiles }  
  }
}

async function goFolder(app: AppState, dbxFolder: string): Promise<void> {
  showApp({...app, progress: "Loading " + dbxFolder})
  showApp({...app, folder: await fetchFolder(app.dropbox, dbxFolder, app.encryptKey)})
}

async function goFile(app: AppState, file: PpFile): Promise<void> {
  showApp({...app, viewFile: file })
  let dbxPath = app.folder.originPath + file.originName
  console.log(dbxPath)
  let resp = (await app.dropbox.filesDownload({ path: dbxPath })) as any

  // TODO: app might have changed -- ensure we have not gone anywhere else

  let blob: Blob = resp.fileBlob  // fileBlob is not in dropbox typescript
  if (file.decrypted && app.encryptKey) {
    let decrypted = await EncLib.decrypt(app.encryptKey, file.decrypted.iv, await EncLib.readBlob(blob))
    blob = new Blob([decrypted], { type: "image/png" })
  }
  let url = window.URL.createObjectURL(blob)
  showApp({...app, viewFile: file, viewFileUrl: url })  
}

async function goUpFolder(app: AppState): Promise<void> {
  var ss = app.folder.originPath.slice(1,-1).split("/")
  if (ss.length == 1) {
    goFolder(app, "/")
  } else {
    ss.pop()
    goFolder(app, "/" + ss.join("/") + "/")
  }
}

async function readDirEntriesAsync(entry): Promise<any> {
  return new Promise((resolve, reject) => {
    entry.createReader().readEntries(resp => resolve(resp), err => reject(err))
  })
}

class PpFileEntry {
  name: string;
  file: File;
}

async function uploadFile(entry: PpFileEntry, app: AppState): Promise<AppState> {
  if (!app.encryptKey) return app

  // are we replacing an existing file?
  showApp({...app, progress: "Uploading " + entry.name})  

  console.log(entry)
  let fileBuf = await EncLib.readBlob(entry.file)

  var newFiles = app.folder.files;
  var replace = app.folder.files.find(o => !o.isFolder && o.decrypted != null && o.decrypted.name == entry.name)

  if (!replace) {
    let iv = EncLib.genIv()
    let filename = await EncLib.encryptFilename(app.encryptKey, iv, entry.name)
    console.log("UPLOADING " + filename)
    replace = {
      displayName: entry.name,
      isFolder: false,
      decrypted: { iv: iv, name: entry.name },
      originName: filename
    }
    newFiles = newFiles.concat(replace)
  }
  if (!replace.decrypted) return app  // fix ts warning

  let content = await EncLib.encrypt(app.encryptKey, replace.decrypted.iv, fileBuf)
  await app.dropbox.filesUpload({path: app.folder.originPath + replace.originName, contents: content})
  return {...app, folder: { ...app.folder, files: newFiles} }
}

function getFiles(fileList: DataTransferItemList): PpFileEntry[] {
  let ret: PpFileEntry[] = []
  for(var i = 0; i < fileList.length; i++) {
    if (fileList[i].kind == 'file') {
      let e = fileList[i].webkitGetAsEntry()
      if (e.isFile) {
        console.log(e)
        let f = fileList[i].getAsFile()
        if (f) { ret.push({ name: e.name, file: f }) }
      }
    }
  }
  return ret
}

async function handleDrop(event: React.DragEvent<HTMLElement>, app: AppState) {
  event.preventDefault()
  console.log("DROPED!")

  const fileList = event.dataTransfer.items
  if (!fileList) { return }

  var newapp = app;
  var files = getFiles(fileList)
  for(var f of files) {
    newapp = await uploadFile(f, newapp)
  }

  // finished, reload original folder
  goFolder(newapp, app.folder.originPath)


  // upload folders


  // // https://wicg.github.io/entries-api/#html-data
  // showScreen(<div>Uploading</div>)
  // console.log("items=" + fileList.length)
  // for(var i = 0; i < fileList.length; i++) {
  //   if (fileList[i].kind == 'file') {
  //     const entry = fileList[i].webkitGetAsEntry()
  //     if (entry.isDirectory) {
  //       let files = await readDirEntriesAsync(entry)
  //       for(var f of files) {
  //         console.log(f.name)
  //       }
        
  //     } else if (entry.isFile) {
  //       const file = entry.file()  
  //       //await $dbx.filesUpload({path: `/${entry.name}`, contents: await encrypt(await readFileAsync(file))})
  //       //loadFolder('')
  //       let iv = genIv()
  //       let encname = await encryptFilename(iv, entry.name)
  //       console.log(encname)
  //       await $dbx.filesUpload({path: `/${encname}`, contents: await encrypt(iv, await readFileAsync(file))})
  //       loadFolder('/')
  //     }
  //   }
  // }
}

function handleDrag(event) {
  event.preventDefault()
}

// async function loadImage(e, origin: string, dec: EncLib.IDecryptedFilename) {
//   e.preventDefault()
//   showScreen(<div>Loading {dec.name}</div>)  
//   let resp = await $dbx.filesDownload({ path: origin })  
//   console.log(resp)

//   let blob: Blob = resp.fileBlob
//   let ab = await EncLib.readBlob(blob)
//   let decrypted = await EncLib.decrypt(ab, dec.iv)
//   let imgblob = new Blob([decrypted], { type: "image/png" })
//   let url = window.URL.createObjectURL(imgblob)
//   console.log(url)
//   showScreen(<div><img src={url}/></div>)
// }

function getDbxToken() {
  return (new URL(document.location.href)).searchParams.get('dbxToken')
}

async function startup() {
  const dbxToken = getDbxToken()
  console.log("dbxToken=" + dbxToken)
  if (dbxToken) {
    const dbx = new Dropbox({ accessToken: dbxToken });
    //const enckey = await EncLib.passwordToKey("abcd1234")
    const app: AppState = { 
      dropbox: dbx, 
      encryptKey: null, 
      folder: { originPath: "/", files: [] }, 
      progress: null,
      viewFile: null,
      viewFileUrl: null }
    goFolder(app, "/")
  } else {
    show(<div>Dropbox login token required</div>)
  }

}
startup();