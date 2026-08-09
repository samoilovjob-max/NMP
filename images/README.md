# Как загрузить ваши изображения в NMP

Чат Cursor **не сохраняет** исходные файлы картинок на сервер.
Положите файлы локально и отправьте в GitHub — после этого они появятся в проекте.

## 1. Скопируйте файлы сюда

```
C:\Users\Serg_PTZ\Desktop\NMP\images\
```

Рекомендуемые имена (можно свои — напишите, подстрою):

| Ваш файл | Сохранить как |
|---|---|
| Логотип (знак) | `logo-mark.png` |
| Логотип с названием | `logo-full.png` |
| Пример_берег_озеро | `shore-lake.jpg` |
| Пример_горная_река | `mountain-river.jpg` |
| Пример_загородный_дом | `country-house.jpg` |
| Пример_кемпинг | `camping.jpg` |
| Товар_1 | `product-1.jpg` |
| Товар_2 | `product-2.jpg` |
| Товар_3 | `product-3.jpg` |
| Товар_4 | `product-4.jpg` |
| Пример_модель_01 | `model-01.jpg` |
| Пример_модель_02 | `model-02.jpg` |
| Пример_модель_03 | `model-03.jpg` |

## 2. В PowerShell

```powershell
cd C:\Users\Serg_PTZ\Desktop\NMP
git checkout main
git pull
git add images
git commit -m "Add brand and product images"
git push
```

## 3. Напишите в чат

«Картинки запушил» — продолжу сборку сайта на ваших файлах.

Логотипы согласованы: в репозитории уже есть SVG-версии знака (`logo-mark.svg`, `logo-full.svg`) для меню и favicon. PNG-оригиналы всё равно желательно добавить.
