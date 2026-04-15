# Notes

One prerequisite for the coverage badge to be live: add a CODECOV_TOKEN secret to your GitHub repo settings (get it at codecov.io by connecting your repo). The CI and version badges will work as soon as you push to GitHub.


## Publishing and use 
For internal or personal use, the standard way to handle this is by "sideloading" it or packaging it as a .vsix file.Here is the breakdown of your options, depending on whether you're still tweaking it or ready to "install" it permanently.

1. The "Quick & Dirty" Method (Development)If you just want to run and test it while you're working on the code, you don't need to package anything.Open your extension folder in VS Code.Press F5.This launches a new window called the Extension Development Host. Your extension will be active in that specific window so you can test your features in real-time.
2. The "Internal Distribution" Method (VSIX)If you want to install it permanently in your main VS Code instance (or send it to a teammate), you should package it into a .vsix file.
   Step A: Package the extensionYou’ll need the official VS Code Extension Manager (vsce) tool.Install the tool (if you haven't)

   ```Bash
   npm install -g @vscode/vsce
    ```

Run the package command inside your extension folder:

```Bash
vsce package
```

Note: You’ll need a publisher name in your package.json for this to work. It doesn't have to be "official"—any string works for local use.
Step B: Install the .vsix fileOnce you have the .vsix file, you can install it two ways:Via the UI: Go to the Extensions view in VS Code ($Ctrl+Shift+X$), click the three dots (...) in the top-right corner, and select Install from VSIX....Via the Command Line:Bashcode --install-extension your-extension-name-0.0.1.vsix
1. The "Manual Sideload" (Local Only)If you just want it to always be active on your machine without "installing" a package, you can move your extension folder into the VS Code extensions directory:Windows: %USERPROFILE%\.vscode\extensionsmacOS / Linux: ~/.vscode/extensionsOnce you drop your project folder there and restart VS Code, it will be treated as an installed extension.Which should you choose?Use F5 for active coding/debugging.Use VSIX if you want to share it with a friend or "set it and forget it" for your own daily workflow. It's much cleaner than manual folder moving!
