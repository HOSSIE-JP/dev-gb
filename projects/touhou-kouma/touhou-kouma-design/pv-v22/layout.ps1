Add-Type -AssemblyName System.Drawing
$pvDir = $PSScriptRoot
$pvBitmap = New-Object System.Drawing.Bitmap 1920,1080
$pvGraphics = [System.Drawing.Graphics]::FromImage($pvBitmap)
$pvGraphics.SmoothingMode = 'AntiAlias'
$pvGraphics.TextRenderingHint = 'AntiAliasGridFit'
$pvGraphics.Clear([System.Drawing.Color]::FromArgb(12,10,24))
$pvBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Rectangle]::new(0,0,1920,1080)),([System.Drawing.Color]::FromArgb(38,16,48)),([System.Drawing.Color]::FromArgb(7,19,35)),45
$pvGraphics.FillRectangle($pvBrush,0,0,1920,1080)
$pvPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180,225,97,144)),2
$pvGraphics.DrawRectangle($pvPen,470,30,980,884)
$pvGraphics.FillRectangle([System.Drawing.Brushes]::Black,480,40,960,864)
$pvGraphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235,7,7,16)),0,928,1920,152)
$pvTitleFont = New-Object System.Drawing.Font 'Meiryo',43,([System.Drawing.FontStyle]::Bold),([System.Drawing.GraphicsUnit]::Pixel)
$pvSmallFont = New-Object System.Drawing.Font 'Meiryo',23,([System.Drawing.FontStyle]::Regular),([System.Drawing.GraphicsUnit]::Pixel)
$pvGraphics.DrawString("東方`n紅魔巡礼 GB",$pvTitleFont,[System.Drawing.Brushes]::White,34,60)
$pvGraphics.DrawString('SCARLET PILGRIMAGE',$pvSmallFont,[System.Drawing.Brushes]::LightPink,36,194)
$pvGraphics.DrawString('AI SLOP GAMES',$pvSmallFont,[System.Drawing.Brushes]::LightGoldenrodYellow,36,236)
$pvGraphics.DrawString("GB / GBC`n東方Project 二次創作STG",$pvSmallFont,[System.Drawing.Brushes]::LightGray,36,305)
$pvGraphics.DrawString('ゆっくり紹介PV',$pvSmallFont,[System.Drawing.Brushes]::White,1500,58)
$pvGraphics.DrawString('収録：GBCモード',$pvSmallFont,[System.Drawing.Brushes]::LightGray,1500,890)
$pvSource = [System.Drawing.Image]::FromFile((Join-Path $pvDir '../color-v21/logo-touhou-notice-master.png'))
Write-Output ($pvSource.Width.ToString()+'x'+$pvSource.Height)
$pvGraphics.DrawImage($pvSource,([System.Drawing.Rectangle]::new(24,514,418,394)),0,590,630,594,[System.Drawing.GraphicsUnit]::Pixel)
$pvGraphics.DrawImage($pvSource,([System.Drawing.Rectangle]::new(1478,493,418,408)),640,570,688,670,[System.Drawing.GraphicsUnit]::Pixel)
$pvGraphics.DrawString('霊夢',$pvTitleFont,[System.Drawing.Brushes]::LightPink,180,444)
$pvGraphics.DrawString('魔理沙',$pvTitleFont,[System.Drawing.Brushes]::LightGoldenrodYellow,1610,428)
$pvBitmap.Save((Join-Path $pvDir 'layout.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$pvSource.Dispose();$pvGraphics.Dispose();$pvBitmap.Dispose();$pvPen.Dispose();$pvBrush.Dispose();$pvTitleFont.Dispose();$pvSmallFont.Dispose()
